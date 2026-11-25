import assert from 'node:assert/strict';
import test from 'node:test';
import pageCommand from '../../src/commands/Moderation/page.js';

function createInteraction({ roles = ['sTaFf   TeAm'], targetBot = false, dmError = null } = {}) {
  const dmMessages = [];
  const channelMessages = [];
  const target = {
    id: 'paged-user',
    username: 'PagedUser',
    globalName: 'Paged User',
    bot: targetBot,
    async createDM() {
      return {
        async send(payload) {
          if (dmError) throw dmError;
          dmMessages.push(payload);
          return payload;
        },
      };
    },
  };
  const interaction = {
    guild: {
      id: 'guild-id',
      name: 'Test Server',
      members: {
        async fetch(userId) {
          if (userId === 'requester-id') {
            return {
              displayName: 'Requester',
              roles: { cache: { some: predicate => roles.some(name => predicate({ name })) } },
            };
          }
          return { displayName: 'Paged User' };
        },
      },
    },
    user: { id: 'requester-id', username: 'RequesterUser' },
    channel: {
      name: 'general',
      isTextBased: () => true,
      async send(payload) {
        channelMessages.push(payload);
        return {
          url: 'https://discord.com/channels/guild-id/channel-id/message-id',
          async delete() { this.deleted = true; },
        };
      },
    },
    options: { getUser: () => target },
    replies: [],
    async reply(payload) {
      this.replies.push(payload);
      return payload;
    },
    async deferReply() {
      this.deferred = true;
    },
    async editReply(payload) {
      this.editedReply = payload;
      return payload;
    },
  };

  return { interaction, dmMessages, channelMessages };
}

test('page DMs the user with server and message link, then posts the plain-text confirmation', async () => {
  const { interaction, dmMessages, channelMessages } = createInteraction();

  await pageCommand.execute(interaction);

  assert.deepEqual(interaction.replies, []);
  assert.equal(dmMessages.length, 1);
  assert.equal(
    dmMessages[0].content,
    'Hi Paged User, Requester has asked for you.\nServer: Test Server\nChannel: #general\nOpen the page request: https://discord.com/channels/guild-id/channel-id/message-id',
  );
  assert.deepEqual(dmMessages[0].allowedMentions, { parse: [] });
  assert.equal(channelMessages.length, 1);
  assert.deepEqual(channelMessages[0], {
    content: 'Hi Requester, Paged User has been requested.',
    allowedMentions: { parse: [] },
  });
  assert.equal(interaction.editedReply, 'Paged Paged User by DM.');
});

test('page rejects users without an approved staff role before sending anything', async () => {
  const { interaction, dmMessages, channelMessages } = createInteraction({ roles: ['Moderator'] });

  await pageCommand.execute(interaction);

  assert.equal(interaction.deferred, true);
  assert.match(interaction.editedReply, /Staff, Staff Team, or Staff Member/);
  assert.equal(dmMessages.length, 0);
  assert.equal(channelMessages.length, 0);
});

test('page removes its announcement when the recipient cannot be DMed', async () => {
  const { interaction, dmMessages, channelMessages } = createInteraction({
    dmError: new Error('Cannot send messages to this user'),
  });
  let deleted = false;
  interaction.channel.send = async payload => {
    channelMessages.push(payload);
    return {
      url: 'https://discord.com/channels/guild-id/channel-id/message-id',
      async delete() { deleted = true; },
    };
  };

  await pageCommand.execute(interaction);

  assert.equal(dmMessages.length, 0);
  assert.equal(channelMessages.length, 1);
  assert.equal(deleted, true);
  assert.match(interaction.editedReply, /could not DM that user/i);
});

test('page rejects bot accounts and self-paging', async () => {
  const botTarget = createInteraction({ targetBot: true });
  await pageCommand.execute(botTarget.interaction);
  assert.match(botTarget.interaction.editedReply, /valid user account/);

  const selfPage = createInteraction();
  selfPage.interaction.options.getUser = () => ({
    id: 'requester-id',
    username: 'Requester',
    bot: false,
  });
  await pageCommand.execute(selfPage.interaction);
  assert.match(selfPage.interaction.editedReply, /cannot page yourself/);
});
