import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

// Simple reminder scaffolding. For production use persist reminders to DB.

export default {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder for yourself or a channel (minutes)')
    .addIntegerOption(opt => opt.setName('minutes').setDescription('When to remind (minutes)').setRequired(true))
    .addStringOption(opt => opt.setName('text').setDescription('Reminder text').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post the reminder in')),
  category: 'Tools',

  async execute(interaction, config, client) {
    try {
      const minutes = interaction.options.getInteger('minutes', true);
      const text = interaction.options.getString('text', true);
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Reminder Set', `I'll remind ${channel} in ${minutes} minute(s).`)], flags: MessageFlags.Ephemeral });

      const ms = Math.max(0, minutes) * 60_000;
      setTimeout(async () => {
        try {
          await channel.send({ embeds: [successEmbed('Reminder', text)] });
          logger.info(`reminder sent for ${interaction.user.id} in ${interaction.guildId}`);
        } catch (err) {
          logger.error('remind delivery error:', err);
        }
      }, ms);

      // TODO: Persist reminders in DB for reliability across restarts.
    } catch (error) {
      logger.error('remind command error:', error);
      await handleInteractionError(interaction, error, { commandName: 'remind', source: 'remind_command' });
    }
  },
};
