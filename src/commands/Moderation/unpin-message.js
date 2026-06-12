import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('unpin-message')
    .setDescription('Unpin a message by ID or link')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(opt => opt.setName('message_id').setDescription('Message ID or link').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel containing the message')),
  category: 'Moderation',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Messages** to unpin messages.')], flags: MessageFlags.Ephemeral });
      }

      const raw = interaction.options.getString('message_id', true);
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid Channel', 'Please select a text or announcement channel.')], flags: MessageFlags.Ephemeral });
      }

      const idMatch = raw.match(/(\d{17,19})$/);
      const messageId = idMatch ? idMatch[1] : raw;

      const message = await channel.messages.fetch(messageId);
      await message.unpin();

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Unpinned', `Message unpinned in ${channel}.`)], flags: MessageFlags.Ephemeral });
      logger.info(`unpin-message by ${interaction.user.id} in ${interaction.guildId}`);
    } catch (error) {
      logger.error('unpin-message error:', error);
      await handleInteractionError(interaction, error, { commandName: 'unpin-message', source: 'unpin_message_command' });
    }
  },
};
