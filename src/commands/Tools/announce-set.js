import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { getGuildConfig, setGuildConfig } from '../../services/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('announce-set')
    .setDescription('Set or clear the default announcements channel for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to use for announcements')),
  category: 'Tools',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** to configure announcements.')], flags: MessageFlags.Ephemeral });
      }

      const channel = interaction.options.getChannel('channel');
      const guildId = interaction.guildId;
      const guildConfig = await getGuildConfig(client, guildId);

      if (channel) {
        if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
          return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid Channel', 'Please select a text or announcement channel.')], flags: MessageFlags.Ephemeral });
        }
        guildConfig.announcementChannelId = channel.id;
        await setGuildConfig(client, guildId, guildConfig);
        return InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Announcements Enabled', `Announcements will now be posted in ${channel}.`)], flags: MessageFlags.Ephemeral });
      }

      guildConfig.announcementChannelId = null;
      await setGuildConfig(client, guildId, guildConfig);
      return InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Announcements Disabled', 'No channel provided — announcements disabled.')], flags: MessageFlags.Ephemeral });
    } catch (error) {
      logger.error('announce-set error:', error);
      await handleInteractionError(interaction, error, { commandName: 'announce-set', source: 'announce_set_command' });
    }
  },
};
