import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isConfiguredBotOwner } from '../../utils/isBotOwner.js';

export default {
  data: new SlashCommandBuilder()
    .setName('dev-guilds')
    .setDescription('List the servers the bot is currently connected to.')
    .setDMPermission(false),
  category: 'Developer',

  async execute(interaction, _guildConfig, client) {
    if (!isConfiguredBotOwner(interaction, client)) {
      return interaction.reply({
        content: 'Only developers listed in OWNER_IDS can use this command.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const guilds = [...client.guilds.cache.values()]
      .sort((a, b) => a.name.localeCompare(b.name));
    const embed = new EmbedBuilder()
      .setTitle(`Connected Servers (${guilds.length})`)
      .setTimestamp();

    for (const guild of guilds.slice(0, 25)) {
      embed.addFields({
        name: guild.name.slice(0, 256),
        value: `ID: \`${guild.id}\`\nMembers: ${guild.memberCount ?? 'Unknown'}`,
        inline: true,
      });
    }

    if (guilds.length > 25) {
      embed.setFooter({ text: 'Showing the first 25 servers.' });
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
