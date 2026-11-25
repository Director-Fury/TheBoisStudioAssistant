import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isConfiguredBotOwner } from '../../utils/isBotOwner.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dev-config')
    .setDescription('Check non-secret bot configuration and environment readiness.')
    .setDMPermission(false),
  category: 'Developer',

  async execute(interaction, _guildConfig, client) {
    if (!isConfiguredBotOwner(interaction, client)) {
      return interaction.reply({
        content: 'Only developers listed in OWNER_IDS can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const ownerCount = client.config.bot.commands.owners.length;
    const configured = value => value ? 'Configured' : 'Missing';
    const embed = new EmbedBuilder()
      .setTitle('Developer Configuration Check')
      .addFields(
        { name: 'Bot token', value: configured(client.config.bot.token), inline: true },
        { name: 'Application ID', value: configured(client.config.bot.clientId), inline: true },
        { name: 'Approved servers', value: String(client.config.bot.guildIds.length), inline: true },
        { name: 'OWNER_IDS', value: `${ownerCount} configured ID(s)`, inline: true },
        {
          name: 'Support DM forwarding',
          value: client.config.bot.supportDmLogChannelId ? 'Enabled' : 'Disabled',
          inline: true,
        },
        { name: 'Environment', value: client.config.env, inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
