import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';

import eventCommand from '../../src/commands/Community/event.js';
import faqCommand from '../../src/commands/Community/faq.js';
import introduceCommand from '../../src/commands/Community/introduce.js';
import suggestionCommand from '../../src/commands/Community/suggestion.js';

function createInteraction({ optionValues = {}, subcommand = null, permissions = false } = {}) {
  return {
    id: 'interaction-id',
    guildId: 'guild-id',
    user: {
      id: 'user-id',
      username: 'TestUser',
      globalName: 'Test User',
      tag: 'TestUser#0001',
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatar.png',
    },
    member: { displayName: 'Test User' },
    memberPermissions: { has: permission => permissions && permission === PermissionFlagsBits.ManageGuild },
    deferred: false,
    replied: false,
    async deferReply(options) {
      this.deferred = true;
      this.deferOptions = options;
    },
    async editReply(response) {
      this.response = response;
      return response;
    },
    options: {
      getSubcommand: () => subcommand,
      getString: name => optionValues[name],
    },
  };
}

test('suggestion command links to the configured HTTPS Lovable portal', async () => {
  const previousUrl = process.env.LOVABLE_SUGGESTION_URL;
  process.env.LOVABLE_SUGGESTION_URL = 'https://example.lovable.app/ideas';
  const interaction = createInteraction();

  try {
    await suggestionCommand.execute(interaction);
    const button = interaction.response.components[0].components[0].toJSON();
    assert.equal(button.url, 'https://example.lovable.app/ideas');
    assert.equal(button.label, 'Open Suggestion Portal');
  } finally {
    if (previousUrl === undefined) delete process.env.LOVABLE_SUGGESTION_URL;
    else process.env.LOVABLE_SUGGESTION_URL = previousUrl;
  }
});

test('suggestion command does not create a link for non-HTTPS portal URLs', async () => {
  const previousUrl = process.env.LOVABLE_SUGGESTION_URL;
  process.env.LOVABLE_SUGGESTION_URL = 'http://example.com/ideas';
  const interaction = createInteraction();

  try {
    await suggestionCommand.execute(interaction);
    assert.match(interaction.response.content, /not configured/i);
    assert.equal(interaction.response.components, undefined);
  } finally {
    if (previousUrl === undefined) delete process.env.LOVABLE_SUGGESTION_URL;
    else process.env.LOVABLE_SUGGESTION_URL = previousUrl;
  }
});

test('event command creates a Discord event with validated times and native RSVPs', async () => {
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const interaction = createInteraction({
    optionValues: {
      name: 'Community Meetup',
      description: 'Meet other members.',
      location: 'Community Hall',
      start: start.toISOString(),
      end: end.toISOString(),
    },
  });
  let eventOptions;
  interaction.guild = {
    scheduledEvents: {
      async create(options) {
        eventOptions = options;
        return { id: 'event-id' };
      },
    },
  };

  await eventCommand.execute(interaction);

  assert.equal(eventOptions.name, 'Community Meetup');
  assert.equal(eventOptions.entityMetadata.location, 'Community Hall');
  assert.match(interaction.response.content, /discord\.com\/events\/guild-id\/event-id/);
});

test('event command rejects invalid time order without calling Discord', async () => {
  const interaction = createInteraction({
    optionValues: {
      name: 'Community Meetup',
      description: 'Meet other members.',
      location: 'Community Hall',
      start: 'not-a-date',
      end: 'not-a-date',
    },
  });
  interaction.guild = {
    scheduledEvents: {
      async create() {
        assert.fail('invalid event times must not be sent to Discord');
      },
    },
  };

  await eventCommand.execute(interaction);

  assert.match(interaction.response.content, /ISO 8601/);
});

test('introduce publishes text without allowing mentions to ping users', async () => {
  const interaction = createInteraction({ optionValues: { about: 'I enjoy building friendly communities.' } });
  let sentMessage;
  interaction.channel = {
    isTextBased: () => true,
    async send(payload) {
      sentMessage = payload;
      return { url: 'https://discord.com/channels/guild-id/channel-id/message-id' };
    },
  };

  await introduceCommand.execute(interaction);

  assert.equal(sentMessage.allowedMentions.parse.length, 0);
  assert.equal(sentMessage.embeds[0].toJSON().description, 'I enjoy building friendly communities.');
  assert.match(interaction.response.content, /discord\.com\/channels/);
});

test('FAQ command requires Manage Server before allowing changes', async () => {
  const interaction = createInteraction({
    subcommand: 'add',
    optionValues: { question: 'Where do I find rules?', answer: 'Read the rules channel.' },
  });

  await faqCommand.execute(interaction, null, {});

  assert.match(interaction.response.content, /Manage Server/);
});

test('FAQ command adds an entry and members can view it', async () => {
  const values = new Map();
  const client = {
    db: {
      async get(key, fallback) {
        return values.has(key) ? values.get(key) : fallback;
      },
      async set(key, value) {
        values.set(key, value);
      },
    },
  };
  const addInteraction = createInteraction({
    subcommand: 'add',
    permissions: true,
    optionValues: { question: 'Where are the rules?', answer: 'Read the rules channel.' },
  });

  await faqCommand.execute(addInteraction, null, client);
  const faqId = values.get('guild:guild-id:config').communityFaqs[0].id;

  const listInteraction = createInteraction({ subcommand: 'list' });
  await faqCommand.execute(listInteraction, null, client);
  assert.equal(listInteraction.response.embeds[0].toJSON().fields[0].name, 'Where are the rules?');

  const viewInteraction = createInteraction({
    subcommand: 'view',
    optionValues: { id: faqId },
  });
  await faqCommand.execute(viewInteraction, null, client);

  assert.match(viewInteraction.response.content, /Where are the rules\?/);
  assert.match(viewInteraction.response.content, /Read the rules channel\./);
});
