import assert from 'node:assert/strict';
import test from 'node:test';

import { SupabaseBridge } from '../../src/services/supabaseBridge.js';
import { saveUserLevelData } from '../../src/services/leveling.js';

const supabaseUrl = 'https://example.supabase.co';
const secretKey = 'sb_secret_test';

function createBridge(fetchImpl = async () => new Response(null, { status: 204 })) {
  return new SupabaseBridge({ url: supabaseUrl, secretKey, fetchImpl });
}

test('Supabase bridge is optional but rejects partial configuration', () => {
  assert.equal(SupabaseBridge.fromEnvironment({}), null);
  assert.throws(
    () => SupabaseBridge.fromEnvironment({ SUPABASE_URL: supabaseUrl }),
    /must both be configured/
  );
  assert.throws(
    () => new SupabaseBridge({ url: 'http://example.supabase.co', secretKey }),
    /HTTPS project URL/
  );
});

test('command logs contain outcomes but do not include interaction options', async () => {
  let request;
  const bridge = createBridge(async (url, options) => {
    request = { url: new URL(url), options };
    return new Response(null, { status: 204 });
  });

  await bridge.logCommand({
    traceId: 'trace-123',
    guildId: '12345678901234567',
    userId: '23456789012345678',
    commandName: 'level',
    status: 'completed',
    durationMs: 125,
    options: { privateValue: 'must not be recorded' },
  });

  assert.equal(request.url.pathname, '/rest/v1/jarvis_command_logs');
  assert.equal(request.options.headers.apikey, secretKey);
  assert.equal(request.options.headers.Authorization, undefined);
  const [record] = JSON.parse(request.options.body);
  assert.deepEqual(Object.keys(record).sort(), [
    'command_name',
    'duration_ms',
    'guild_id',
    'occurred_at',
    'status',
    'trace_id',
    'user_id',
  ]);
  assert.equal(record.trace_id, 'trace-123');
  assert.equal(record.status, 'completed');
  assert.equal(Object.hasOwn(record, 'options'), false);
});

test('level updates remain queued after failure and are removed after success', async () => {
  let shouldFail = true;
  let uploaded;
  const bridge = createBridge(async (_url, options) => {
    if (shouldFail) {
      return new Response('unavailable', { status: 503 });
    }
    uploaded = JSON.parse(options.body);
    return new Response(null, { status: 204 });
  });

  bridge.queueLevelUpdate('12345678901234567', '23456789012345678', {
    xp: 15,
    level: 2,
    totalXp: 165,
    lastMessage: 1234,
  });
  await assert.rejects(bridge.flushLevelUpdates(), /request failed \(503\)/);
  assert.equal(bridge.pendingLevelUpdates.size, 1);

  shouldFail = false;
  assert.equal(await bridge.flushLevelUpdates(), 1);
  assert.equal(bridge.pendingLevelUpdates.size, 0);
  assert.equal(uploaded[0].total_xp, 165);
});

test('control requests cannot change an admin requester own level', async () => {
  const bridge = createBridge(async (url) => {
    assert.match(new URL(url).pathname, /jarvis_dashboard_memberships$/);
    return Response.json([{
      discord_user_id: '23456789012345678',
      role: 'admin',
    }]);
  });
  const client = {
    config: { bot: { guildIds: ['12345678901234567'] } },
    guilds: { cache: { get() { assert.fail('must reject before guild lookup'); } } },
  };
  const request = {
    action: 'set_level',
    guild_id: '12345678901234567',
    target_user_id: '23456789012345678',
    payload: { level: 20 },
    created_by: '123e4567-e89b-42d3-a456-426614174000',
  };

  await assert.rejects(
    bridge.executeControlRequest(client, request),
    (error) => error.code === 'self_target_forbidden'
  );
});

test('transient guild member lookup errors fail instead of falsely rejecting the request', async () => {
  const bridge = createBridge(async () => Response.json([{
    discord_user_id: '34567890123456789',
    role: 'admin',
  }]));
  const client = {
    config: { bot: { guildIds: ['12345678901234567'] } },
    guilds: {
      cache: {
        get() {
          return {
            members: {
              async fetch() {
                const error = new Error('Discord is unavailable');
                error.code = 503;
                throw error;
              },
            },
          };
        },
      },
    },
  };
  const request = {
    action: 'set_level',
    guild_id: '12345678901234567',
    target_user_id: '23456789012345678',
    payload: { level: 20 },
    created_by: '123e4567-e89b-42d3-a456-426614174000',
  };

  await assert.rejects(bridge.executeControlRequest(client, request), (error) => {
    assert.equal(error.code, 'guild_member_lookup_failed');
    assert.equal(error.rejected, false);
    return true;
  });
});

test('level persistence succeeds when optional Supabase queueing fails', async () => {
  let saved;
  const client = {
    db: {
      async set(key, data) {
        saved = { key, data };
      },
    },
    supabaseBridge: {
      queueLevelUpdate() {
        throw new Error('queue is full');
      },
    },
  };

  await saveUserLevelData(client, '12345678901234567', '23456789012345678', {
    xp: 20,
    level: 1,
    totalXp: 70,
    lastMessage: 1234,
  });

  assert.equal(saved.key, '12345678901234567:leveling:users:23456789012345678');
  assert.equal(saved.data.totalXp, 70);
});
