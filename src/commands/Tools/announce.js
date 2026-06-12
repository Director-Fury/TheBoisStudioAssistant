import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a formatted announcement to a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName('message').setDescription('Announcement text').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in'))
    .addBooleanOption(opt => opt.setName('embed').setDescription('Send as embed')),
  category: 'Tools',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** to use this command.')], flags: MessageFlags.Ephemeral });
      }

      const text = interaction.options.getString('message', true);
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const useEmbed = interaction.options.getBoolean('embed') || false;

      if (channel && channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid Channel', 'Please select a text or announcement channel.')], flags: MessageFlags.Ephemeral });
      }

      if (useEmbed) {
        await channel.send({ embeds: [successEmbed('Announcement', text)] });
      } else {
        await channel.send({ content: text });
      }

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Posted', `Announcement posted in ${channel}.`)], flags: MessageFlags.Ephemeral });
      logger.info(`announce executed by ${interaction.user.id} in ${interaction.guildId}`);
    } catch (error) {
      logger.error('announce command error:', error);
      await handleInteractionError(interaction, error, { commandName: 'announce', source: 'announce_command' });
    }
  },
};
