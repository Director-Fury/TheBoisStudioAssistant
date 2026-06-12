import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { successEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { logger } from '../../utils/logger.js';
import { handleInteractionError } from '../../utils/errorHandler.js';

export default {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Send a message to a channel and optionally mention a role')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(opt => opt.setName('message').setDescription('Message to broadcast').setRequired(true))
    .addChannelOption(opt => opt.setName('channel').setDescription('Channel to post in'))
    .addRoleOption(opt => opt.setName('role').setDescription('Role to mention')),
  category: 'Tools',

  async execute(interaction, config, client) {
    try {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Permission Denied', 'You need **Manage Server** to use this command.')], flags: MessageFlags.Ephemeral });
      }

      const text = interaction.options.getString('message', true);
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      const role = interaction.options.getRole('role');

      if (channel && channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
        return InteractionHelper.safeReply(interaction, { embeds: [errorEmbed('Invalid Channel', 'Please select a text or announcement channel.')], flags: MessageFlags.Ephemeral });
      }

      const content = role ? `${role} ${text}` : text;
      await channel.send({ content });

      await InteractionHelper.safeReply(interaction, { embeds: [successEmbed('Broadcast Sent', `Message posted in ${channel}.`)], flags: MessageFlags.Ephemeral });
      logger.info(`broadcast executed by ${interaction.user.id} in ${interaction.guildId}`);
    } catch (error) {
      logger.error('broadcast command error:', error);
      await handleInteractionError(interaction, error, { commandName: 'broadcast', source: 'broadcast_command' });
    }
  },
};
