import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import caseCommand from '../../src/commands/Moderation/case.js';
import { WarningService } from '../../src/services/warningService.js';
import { db } from '../../src/utils/database.js';
import { MemoryStorage } from '../../src/utils/memoryStorage.js';
import { getModerationCases } from '../../src/utils/moderation.js';

function createInteraction({ type, details, permission, targetIsMember = true }) {
  const target = { id: 'target-user', tag: 'Target#1234', username: 'Target' };
  return {
    guild: {
      id: 'test-guild',
      channels: { cache: new Map() },
    },
    user: { id: 'moderator-user', tag: 'Moderator#1234', username: 'Moderator' },
    memberPermissions: {
      has(requestedPermission) {
        return requestedPermission === permission;
      },
    },
    options: {
      getUser(name) { return name === 'target' ? target : null; },
      getString(name) {
        if (name === 'type') return type;
        if (name === 'details') return details;
        return null;
      },
      getMember(name) {
        return name === 'target' && targetIsMember ? target : null;
      },
    },
    deferred: false,
    replied: false,
    async reply(payload) {
      this.replied = true;
      this.replyPayload = payload;
      return payload;
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload) {
      this.replyPayload = payload;
      return payload;
    },
  };
}

function createClient() {
  return {
    db,
    user: { id: 'bot-user' },
  };
}

function useInMemoryDatabase() {
  const original = {
    initialized: db.initialized,
    db: db.db,
    useFallback: db.useFallback,
    connectionType: db.connectionType,
    degradedModeWarningShown: db.degradedModeWarningShown,
    degradedReason: db.degradedReason,
  };
  db.initialized = true;
  db.db = new MemoryStorage();
  db.useFallback = true;
  db.connectionType = 'memory';

  return () => Object.assign(db, original);
}

test('case command creates a note and a formal warning in moderation history', async () => {
  const restoreDatabase = useInMemoryDatabase();
  try {
    const client = createClient();
    const noteInteraction = createInteraction({
      type: 'note',
      details: 'Follow up with the member about the incident.',
      permission: PermissionFlagsBits.ManageMessages,
    });
    await caseCommand.execute(noteInteraction, null, client);

    assert.match(noteInteraction.replyPayload, /Created note case #1/);
    const noteCases = await getModerationCases('test-guild', { userId: 'target-user' });
    assert.equal(noteCases[0].action, 'Case Note Added');
    assert.equal(noteCases[0].metadata.caseType, 'note');

    const warningInteraction = createInteraction({
      type: 'warning',
      details: 'Please stop posting disruptive messages.',
      permission: PermissionFlagsBits.ModerateMembers,
    });
    await caseCommand.execute(warningInteraction, null, client);

    assert.match(warningInteraction.replyPayload, /Created warning case #2/);
    assert.match(warningInteraction.replyPayload, /Total active warnings: 1/);
    const cases = await getModerationCases('test-guild', { userId: 'target-user' });
    assert.equal(cases.length, 2);
    assert.equal(cases[0].action, 'User Warned');
    assert.equal(cases[0].metadata.caseType, 'warning');

    const warnings = await WarningService.getWarnings('test-guild', 'target-user');
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].reason, 'Please stop posting disruptive messages.');
  } finally {
    restoreDatabase();
  }
});

test('case command enforces permissions and requires an in-server target for warnings', async () => {
  const denied = createInteraction({
    type: 'note',
    details: 'Internal note',
    permission: PermissionFlagsBits.ModerateMembers,
  });
  await caseCommand.execute(denied, null, createClient());
  assert.match(denied.replyPayload.content, /Manage Messages/);
  assert.equal(denied.deferred, false);

  const absentMember = createInteraction({
    type: 'warning',
    details: 'Reason',
    permission: PermissionFlagsBits.ModerateMembers,
    targetIsMember: false,
  });
  await caseCommand.execute(absentMember, null, createClient());
  assert.match(absentMember.replyPayload.content, /currently in this server/);
  assert.equal(absentMember.deferred, false);
});
