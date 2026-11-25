import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection, PermissionFlagsBits } from 'discord.js';
import securityCheckCommand from '../../src/commands/Developer/security-check.js';

function createInteraction(userId, guild = null) {
  return {
    user: { id: userId },
    guild,
    replies: [],
    async reply(payload) {
      this.replies.push(payload);
      return payload;
    },
    async deferReply() {},
    async editReply(payload) {
      this.editedReply = payload;
      return payload;
    },
  };
}

const client = {
  config: { bot: { commands: { owners: ['12345678901234567'] } } },
};

test('security check privately reports selected server risks and privileged roles', async () => {
  const interaction = createInteraction('12345678901234567');
  const everyonePermissions = new Set([PermissionFlagsBits.ManageRoles]);
  const adminPermissions = new Set([PermissionFlagsBits.Administrator]);
  const permissions = granted => ({
    has(permission) { return granted.has(permission); },
  });
  interaction.guild = {
    id: 'guild-id',
    name: 'Test Server',
    mfaLevel: 0,
    verificationLevel: 1,
    explicitContentFilter: 0,
    roles: {
      everyone: { permissions: permissions(everyonePermissions) },
      cache: new Collection([
        ['guild-id', { id: 'guild-id', name: '@everyone', permissions: permissions(everyonePermissions) }],
        ['role-id', { id: 'role-id', name: 'Security Admin', permissions: permissions(adminPermissions) }],
      ]),
    },
    members: { me: { permissions: permissions(adminPermissions) } },
  };

  await securityCheckCommand.execute(interaction, null, client);

  const embed = interaction.editedReply.embeds[0].toJSON();
  const findings = embed.fields.find(field => field.name === 'Findings (6)').value;
  assert.match(findings, /Moderator MFA is not required/);
  assert.match(findings, /verification is set to Low/);
  assert.match(findings, /explicit media filter is disabled/);
  assert.match(findings, /@everyone has elevated permissions: Manage Roles/);
  assert.match(findings, /bot has Administrator permission/);
  assert.match(findings, /1 other role\(s\) have elevated permissions/);
  assert.match(embed.fields.find(field => field.name.startsWith('Other roles')).value, /Security Admin: Administrator/);
  assert.deepEqual(interaction.editedReply.allowedMentions, { parse: [] });
});

test('security check reports no findings when checked settings and permissions are within bounds', async () => {
  const interaction = createInteraction('12345678901234567');
  const permissions = { has() { return false; } };
  interaction.guild = {
    id: 'guild-id',
    name: 'Test Server',
    mfaLevel: 1,
    verificationLevel: 2,
    explicitContentFilter: 2,
    roles: {
      everyone: { permissions },
      cache: new Collection([
        ['guild-id', { id: 'guild-id', name: '@everyone', permissions }],
      ]),
    },
    members: { me: { permissions } },
  };

  await securityCheckCommand.execute(interaction, null, client);

  const embed = interaction.editedReply.embeds[0].toJSON();
  assert.equal(embed.fields.find(field => field.name === 'Findings (0)').value, 'No issues found by these checks.');
});

test('security check rejects non-owners and direct-message invocation', async () => {
  const unauthorized = createInteraction('99999999999999999');
  await securityCheckCommand.execute(unauthorized, null, client);
  assert.match(unauthorized.replies[0].content, /Only developers/);

  const directMessage = createInteraction('12345678901234567');
  await securityCheckCommand.execute(directMessage, null, client);
  assert.match(directMessage.replies[0].content, /only available in a server/);
});
