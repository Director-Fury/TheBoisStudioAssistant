import assert from 'node:assert/strict';
import test from 'node:test';
import messageCreate from '../../src/events/messageCreate.js';

test('forwards user DMs to the configured support log channel', async () => {
  const sent = [];
  const destination = {
    guild: { id: 'support-guild' },
    isTextBased: () => true,
    send: async payload => sent.push(payload),
  };
  const client = {
    config: { bot: { supportDmLogChannelId: 'log-channel' } },
    channels: { fetch: async id => {
      assert.equal(id, 'log-channel');
      return destination;
    } },
  };
  const message = {
    author: { bot: false, tag: 'user#1234', id: 'user-id' },
    guild: null,
    content: 'Please help @everyone',
    createdTimestamp: 1_700_000_000_000,
    attachments: new Map([['attachment', { url: 'https://example.com/file.png' }]]),
  };

  await messageCreate.execute(message, client);

  assert.equal(sent.length, 1);
  assert.match(sent[0].content, /Please help @everyone/);
  assert.match(sent[0].content, /https:\/\/example\.com\/file\.png/);
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });
});

test('does not attempt DM forwarding without a configured destination', async () => {
  const client = {
    config: { bot: { supportDmLogChannelId: '' } },
    channels: { fetch: async () => assert.fail('Should not fetch a channel') },
  };
  const message = {
    author: { bot: false },
    guild: null,
  };

  await messageCreate.execute(message, client);
});

test('ignores messages sent by bots', async () => {
  const client = {
    config: { bot: { supportDmLogChannelId: 'log-channel' } },
    channels: { fetch: async () => assert.fail('Bot messages should be ignored') },
  };
  const message = {
    author: { bot: true },
    guild: null,
  };

  await messageCreate.execute(message, client);
});
