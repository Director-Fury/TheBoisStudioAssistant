import assert from 'node:assert/strict';
import test from 'node:test';
import command, { buildStaffDmEmbed } from '../../src/commands/Moderation/dm.js';

test('anonymous staff DMs place the department and server sign-off after the message', () => {
  const embed = buildStaffDmEmbed({
    serverId: '1367772622678659083',
    serverName: 'The Bois Studio',
    anonymous: true,
    department: 'Development Team',
    displayName: 'Staff Member',
    position: undefined,
    message: 'We received your report.',
    serverIconUrl: 'https://example.com/support-icon.png',
  }).toJSON();

  assert.equal(embed.title, 'Message from **The Bois Studio**');
  assert.equal(embed.description, 'We received your report.\n\n**Development Team**\nThe Bois Studio');
  assert.equal(embed.color, 0x0ddd0a);
  assert.equal(embed.thumbnail.url, 'https://example.com/support-icon.png');
  assert.equal(embed.footer.text, 'You can reply to this message; our team will receive your message(s).');
  assert.ok(embed.timestamp);
});

test('identified staff DMs place the sender, position, and server sign-off after the message', () => {
  const embed = buildStaffDmEmbed({
    serverId: '1367772622678659083',
    serverName: 'The Bois Studio',
    anonymous: false,
    department: undefined,
    displayName: 'Studio Nickname',
    position: 'Security Lead',
    message: 'Please contact our team.',
    serverIconUrl: null,
  }).toJSON();

  assert.equal(embed.title, 'Message from **The Bois Studio**');
  assert.equal(embed.description, 'Please contact our team.\n\n**Studio Nickname**\n*Security Lead*\nThe Bois Studio');
  assert.equal(embed.footer.text, 'You can reply to this message; our team will receive your message(s).');
  assert.ok(embed.timestamp);
});

test('DM embeds use a distinct color for each configured server', () => {
  const serverColors = [
    ['1365612445342629918', 0xf54c4e],
    ['1042620015402291270', 0x0ca7c7],
    ['1367772622678659083', 0x0ddd0a],
  ].map(([serverId]) => buildStaffDmEmbed({
    serverId,
    serverName: 'Server',
    anonymous: true,
    department: 'Security Team',
    message: 'Message',
  }).toJSON().color);

  assert.deepEqual(serverColors, [0xf54c4e, 0x0ca7c7, 0x0ddd0a]);
  assert.equal(new Set(serverColors).size, serverColors.length);
});

test('/dm exposes the department and position fields', () => {
  const options = command.data.toJSON().options;
  const department = options.find(option => option.name === 'department');
  const position = options.find(option => option.name === 'position');

  assert.deepEqual(
    department.choices.map(choice => choice.value),
    [
      'General Support Team',
      'Management Support Team',
      'Maintenance Team',
      'Security Team',
      'Development Team',
      'Management Team',
      'Executives Team',
    ],
  );
  assert.equal(position.max_length, 80);
});
