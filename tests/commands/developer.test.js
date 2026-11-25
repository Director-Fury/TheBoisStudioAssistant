import assert from 'node:assert/strict';
import test from 'node:test';
import { Collection } from 'discord.js';
import maintenanceCommand from '../../src/commands/Developer/maintenance.js';
import dmRemoveCommand from '../../src/commands/Developer/dm-remove.js';
import messageCreateEvent from '../../src/events/messageCreate.js';
import { MAINTENANCE_REPLY, restoreMaintenanceMode } from '../../src/utils/maintenanceMode.js';

function createInteraction(userId, options = {}) {
  return {
    user: { id: userId },
    options: {
      getString: name => options[name],
      getBoolean: name => options[name],
    },
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

test('maintenance mode persists, updates DND presence, and restores after restart', async () => {
  const stored = new Map();
  const presenceUpdates = [];
  const client = {
    config: {
      bot: {
        commands: { owners: ['12345678901234567'] },
        presence: { status: 'online', activities: [{ name: 'Jarvis', type: 1 }] },
      },
    },
    user: { id: 'bot-id', setPresence: presence => presenceUpdates.push(presence) },
    db: {
      async set(key, value) { stored.set(key, value); },
      async get(key, fallback) { return stored.has(key) ? stored.get(key) : fallback; },
    },
    maintenanceMode: false,
  };

  const interaction = createInteraction('12345678901234567', { mode: 'enable' });
  await maintenanceCommand.execute(interaction, null, client);

  assert.equal(client.maintenanceMode, true);
  assert.equal(presenceUpdates.at(-1).status, 'dnd');
  assert.equal(stored.get('bot:maintenance_mode'), true);

  client.maintenanceMode = false;
  await restoreMaintenanceMode(client);
  assert.equal(client.maintenanceMode, true);
  assert.equal(presenceUpdates.at(-1).status, 'dnd');
});

test('developer commands reject users not listed in OWNER_IDS', async () => {
  const interaction = createInteraction('99999999999999999', { mode: 'enable' });
  const client = {
    config: { bot: { commands: { owners: ['12345678901234567'] } } },
    maintenanceMode: false,
    db: { async set() { assert.fail('unauthorized user must not write state'); } },
  };

  await maintenanceCommand.execute(interaction, null, client);

  assert.match(interaction.replies[0].content, /OWNER_IDS/);
});

test('DM cleanup deletes only bot-authored messages across history pages', async () => {
  const deletedIds = [];
  const fetchedPages = [];
  const firstPage = new Collection([
    ['message-new', { id: 'message-new', author: { id: 'bot-id' }, async delete() { deletedIds.push(this.id); } }],
    ['message-old', { id: 'message-old', author: { id: 'user-id' }, async delete() { deletedIds.push(this.id); } }],
  ]);
  const secondPage = new Collection([
    ['message-older', { id: 'message-older', author: { id: 'bot-id' }, async delete() { deletedIds.push(this.id); } }],
  ]);
  const interaction = createInteraction('12345678901234567', {
    user_id: '23456789012345678',
    confirm: true,
  });
  const client = {
    user: { id: 'bot-id' },
    config: { bot: { commands: { owners: ['12345678901234567'] } } },
    users: {
      async fetch() {
        return {
          async createDM() {
            return {
              messages: {
                async fetch(options) {
                  fetchedPages.push(options);
                  if (fetchedPages.length === 1) return firstPage;
                  if (fetchedPages.length === 2) return secondPage;
                  return new Collection();
                },
              },
            };
          },
        };
      },
    },
  };

  await dmRemoveCommand.execute(interaction, null, client);

  assert.deepEqual(deletedIds, ['message-new', 'message-older']);
  assert.equal(fetchedPages.length, 3);
  assert.equal(fetchedPages[1].before, 'message-old');
  assert.match(interaction.editedReply, /Deleted 2 bot-authored message/);
});

test('maintenance DMs receive the notice without being forwarded to support logging', async () => {
  let repliedWith;
  const message = {
    author: { bot: false },
    guild: null,
    async reply(payload) { repliedWith = payload; },
  };

  await messageCreateEvent.execute(message, { maintenanceMode: true });

  assert.equal(repliedWith.content, MAINTENANCE_REPLY);
});
