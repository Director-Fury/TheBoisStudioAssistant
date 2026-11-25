import { randomUUID } from 'node:crypto';
import { setUserLevel } from './leveling.js';
import { logger } from '../utils/logger.js';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
const MAX_PENDING_LEVEL_UPDATES = 5000;
const LEVEL_BATCH_SIZE = 100;
const CONTROL_BATCH_SIZE = 10;
const STALE_REQUEST_MS = 10 * 60 * 1000;
const DISCORD_ID_PATTERN = /^\d{17,20}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class ControlRequestError extends Error {
  constructor(code, message, rejected = true) {
    super(message);
    this.code = code;
    this.rejected = rejected;
  }
}

export class SupabaseBridge {
  constructor({ url, secretKey, fetchImpl = globalThis.fetch }) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error('SUPABASE_URL must be a valid HTTPS URL');
    }

    if (
      parsedUrl.protocol !== 'https:'
      || parsedUrl.username
      || parsedUrl.password
      || parsedUrl.pathname !== '/'
      || parsedUrl.search
      || parsedUrl.hash
    ) {
      throw new Error('SUPABASE_URL must be an HTTPS project URL without credentials or a path');
    }
    if (typeof secretKey !== 'string' || !secretKey.trim()) {
      throw new Error('SUPABASE_SECRET_KEY is required when the Supabase bridge is enabled');
    }
    if (typeof fetchImpl !== 'function') {
      throw new Error('A Fetch API implementation is required for the Supabase bridge');
    }

    this.baseUrl = parsedUrl.origin;
    this.secretKey = secretKey.trim();
    this.fetchImpl = fetchImpl;
    this.pendingLevelUpdates = new Map();
    this.polling = false;
  }

  static fromEnvironment(env = process.env) {
    const configured = REQUIRED_ENV.map((key) => Boolean(env[key]?.trim()));
    if (configured.every((value) => !value)) {
      return null;
    }
    if (configured.some((value) => !value)) {
      throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must both be configured');
    }

    return new SupabaseBridge({
      url: env.SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
  }

  async request(table, query = {}, { method = 'GET', body, prefer } = {}) {
    if (!/^[a-z_]+$/.test(table)) {
      throw new Error('Invalid Supabase table name');
    }

    const url = new URL(`/rest/v1/${table}`, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }

    const headers = { apikey: this.secretKey };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (prefer) {
      headers.Prefer = prefer;
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Supabase ${table} request failed (${response.status}): ${responseText.slice(0, 400)}`);
    }
    if (!responseText) {
      return null;
    }

    return JSON.parse(responseText);
  }

  logCommand({ traceId, guildId, userId, commandName, status, durationMs, occurredAt }) {
    const safeStatus = status === 'completed' ? 'completed' : 'error';
    return this.request('jarvis_command_logs', { on_conflict: 'trace_id' }, {
      method: 'POST',
      prefer: 'resolution=ignore-duplicates,return=minimal',
      body: [{
        trace_id: String(traceId || randomUUID()).slice(0, 100),
        guild_id: String(guildId),
        user_id: String(userId),
        command_name: String(commandName).slice(0, 64),
        status: safeStatus,
        duration_ms: Math.max(0, Math.trunc(Number(durationMs) || 0)),
        occurred_at: occurredAt || new Date().toISOString(),
      }],
    });
  }

  queueLevelUpdate(guildId, userId, data) {
    if (!DISCORD_ID_PATTERN.test(String(guildId)) || !DISCORD_ID_PATTERN.test(String(userId))) {
      throw new Error('Invalid guild or user ID for Supabase level sync');
    }

    const key = `${guildId}:${userId}`;
    if (!this.pendingLevelUpdates.has(key) && this.pendingLevelUpdates.size >= MAX_PENDING_LEVEL_UPDATES) {
      throw new Error('Supabase level sync queue is full');
    }

    this.pendingLevelUpdates.set(key, {
      guild_id: String(guildId),
      user_id: String(userId),
      xp: Math.max(0, Math.trunc(Number(data.xp) || 0)),
      level: Math.max(0, Math.min(1000, Math.trunc(Number(data.level) || 0))),
      total_xp: Math.max(0, Math.trunc(Number(data.totalXp) || 0)),
      last_message_ms: Math.max(0, Math.trunc(Number(data.lastMessage) || 0)),
      synced_at: new Date().toISOString(),
    });
  }

  async flushLevelUpdates() {
    const batch = [...this.pendingLevelUpdates.entries()].slice(0, LEVEL_BATCH_SIZE);
    if (batch.length === 0) {
      return 0;
    }

    await this.request('jarvis_user_levels', { on_conflict: 'guild_id,user_id' }, {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: batch.map(([, row]) => row),
    });

    for (const [key, row] of batch) {
      if (this.pendingLevelUpdates.get(key) === row) {
        this.pendingLevelUpdates.delete(key);
      }
    }
    return batch.length;
  }

  async pollControlRequests(client) {
    if (this.polling) {
      return;
    }
    this.polling = true;

    try {
      try {
        await this.flushLevelUpdates();
      } catch (error) {
        logger.error('Could not sync queued level updates to Supabase:', error);
      }

      const staleBefore = new Date(Date.now() - STALE_REQUEST_MS).toISOString();
      await this.request('jarvis_control_requests', {
        status: 'eq.processing',
        processing_started_at: `lt.${staleBefore}`,
      }, {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { status: 'pending', processing_started_at: null },
      });

      const requests = await this.request('jarvis_control_requests', {
        select: 'id,action,guild_id,target_user_id,payload,created_by',
        status: 'eq.pending',
        order: 'created_at.asc',
        limit: CONTROL_BATCH_SIZE,
      });

      for (const request of requests || []) {
        try {
          await this.processControlRequest(client, request);
        } catch (error) {
          logger.error('Could not process a Supabase control request:', {
            requestId: request.id,
            error: error.message,
          });
        }
      }
    } finally {
      this.polling = false;
    }
  }

  async processControlRequest(client, request) {
    const claimed = await this.request('jarvis_control_requests', {
      id: `eq.${request.id}`,
      status: 'eq.pending',
      select: 'id',
    }, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status: 'processing',
        processing_started_at: new Date().toISOString(),
      },
    });

    if (!Array.isArray(claimed) || claimed.length === 0) {
      return;
    }

    let status = 'succeeded';
    let result;
    try {
      result = await this.executeControlRequest(client, request);
    } catch (error) {
      status = error instanceof ControlRequestError
        ? (error.rejected ? 'rejected' : 'failed')
        : 'failed';
      result = {
        code: error instanceof ControlRequestError ? error.code : 'processing_failed',
      };
      logger.warn('Supabase control request was not applied:', {
        requestId: request.id,
        code: result.code,
        error: error.message,
      });
    }

    const completed = await this.request('jarvis_control_requests', {
      id: `eq.${request.id}`,
      status: 'eq.processing',
      select: 'id',
    }, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        status,
        result,
        completed_at: new Date().toISOString(),
      },
    });

    if (!Array.isArray(completed) || completed.length === 0) {
      throw new Error(`Supabase control request ${request.id} was claimed but not completed`);
    }
  }

  async executeControlRequest(client, request) {
    if (request.action !== 'set_level') {
      throw new ControlRequestError('unsupported_action', 'The requested action is not allowed');
    }

    const guildId = String(request.guild_id || '');
    const targetUserId = String(request.target_user_id || '');
    const level = request.payload?.level;
    if (
      !DISCORD_ID_PATTERN.test(guildId)
      || !DISCORD_ID_PATTERN.test(targetUserId)
      || !Number.isInteger(level)
      || level < 0
      || level > 1000
      || !UUID_PATTERN.test(String(request.created_by || ''))
    ) {
      throw new ControlRequestError('invalid_request', 'The request fields are invalid');
    }
    if (!client.config.bot.guildIds.includes(guildId)) {
      throw new ControlRequestError('guild_not_enabled', 'The guild is not enabled for this bot');
    }

    const memberships = await this.request('jarvis_dashboard_memberships', {
      select: 'discord_user_id,role',
      auth_user_id: `eq.${request.created_by}`,
      guild_id: `eq.${guildId}`,
      limit: '1',
    });
    const membership = Array.isArray(memberships) ? memberships[0] : null;
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      throw new ControlRequestError('not_authorized', 'The requester is not an authorized dashboard admin');
    }
    if (String(membership.discord_user_id) === targetUserId) {
      throw new ControlRequestError('self_target_forbidden', 'Dashboard admins cannot change their own level');
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      throw new ControlRequestError('bot_not_in_guild', 'The bot is not connected to the requested guild');
    }

    try {
      await guild.members.fetch(targetUserId);
    } catch (error) {
      if (error.code === 10007 || error.code === '10007') {
        throw new ControlRequestError('target_not_in_guild', 'The target user is not a member of this guild');
      }
      throw new ControlRequestError(
        'guild_member_lookup_failed',
        `Could not verify the target guild member: ${error.message}`,
        false
      );
    }

    const userData = await setUserLevel(client, guildId, targetUserId, level);
    return { level: userData.level, total_xp: userData.totalXp };
  }
}

export default SupabaseBridge;
