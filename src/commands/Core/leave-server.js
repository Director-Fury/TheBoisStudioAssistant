import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isBotOwner } from '../../utils/isBotOwner.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave-server')
        .setDescription('Make Jarvis - TBS leave a server by its ID.')
        .addStringOption(option =>
            option
                .setName('server_id')
                .setDescription('The ID of the server TitanBot should leave.')
                .setMinLength(17)
                .setMaxLength(20)
                .setRequired(true)
        ),

    async execute(interaction, _guildConfig, client) {
        if (!isBotOwner(interaction, client)) {
            return interaction.reply({
                content: 'Only the bot owner can use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        const guildId = interaction.options.getString('server_id', true).trim();
        if (!/^\d{17,20}$/.test(guildId)) {
            return interaction.reply({
                content: 'Enter a valid Discord server ID.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (client.config.bot.guildIds.includes(guildId)) {
            return interaction.reply({
                content: 'That server is on the approved-server list, so I will stay there.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guild = client.guilds.cache.get(guildId) ?? await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return interaction.editReply('TitanBot is not currently in that server, or it could not be found.');
        }

        await guild.leave();
        return interaction.editReply(`TitanBot left **${guild.name}** (${guild.id}).`);
    }
};