import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';

const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseDateTime(value) {
  if (!DATE_TIME_PATTERN.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('Create a server event that members can RSVP to.')
    .setDefaultMemberPermissions(PermissionFlagsBits.CreateEvents)
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Name of the event')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('What the event is about')
        .setRequired(true)
        .setMaxLength(1000),
    )
    .addStringOption(option =>
      option
        .setName('location')
        .setDescription('Where the event will take place')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption(option =>
      option
        .setName('start')
        .setDescription('Start time in ISO 8601 format, including timezone')
        .setRequired(true)
        .setMaxLength(35),
    )
    .addStringOption(option =>
      option
        .setName('end')
        .setDescription('End time in ISO 8601 format, including timezone')
        .setRequired(true)
        .setMaxLength(35),
    ),
  category: 'Community',

  async execute(interaction) {
    const deferred = await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
    if (!deferred) return;

    const start = parseDateTime(interaction.options.getString('start'));
    const end = parseDateTime(interaction.options.getString('end'));
    if (!start || !end || start <= new Date() || end <= start) {
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Use valid ISO 8601 date-times with a timezone. The start must be in the future and the end must be later.',
      });
    }

    try {
      const event = await interaction.guild.scheduledEvents.create({
        name: interaction.options.getString('name'),
        description: interaction.options.getString('description'),
        scheduledStartTime: start,
        scheduledEndTime: end,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        entityType: GuildScheduledEventEntityType.External,
        entityMetadata: {
          location: interaction.options.getString('location'),
        },
        reason: `Created by ${interaction.user.tag} using /event`,
      });

      const eventUrl = `https://discord.com/events/${interaction.guildId}/${event.id}`;
      return InteractionHelper.safeEditReply(interaction, {
        content: `Created the server event. Members can view it and RSVP here: ${eventUrl}`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.error('Could not create server event:', error);
      return InteractionHelper.safeEditReply(interaction, {
        content: 'Could not create the event. Check that the bot has permission to create server events.',
      });
    }
  },
};
