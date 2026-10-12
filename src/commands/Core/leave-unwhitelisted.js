import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { isBotOwner } from '../../utils/isBotOwner.js';
import { logger } from '../../utils/logger.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave-unwhitelisted')
        .setDescription('Make Jarvis - TBS leave every server outside the approved-server list.'),

    async execute(interaction, _guildConfig, client) {
        if (!isBotOwner(interaction, client)) {
            return interaction.reply({
                content: 'Only the bot owner can use this command.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const approvedGuildIds = new Set(client.config.bot.guildIds);
        const guildsToLeave = [...client.guilds.cache.values()]
            .filter(guild => !approvedGuildIds.has(guild.id));

        let leftCount = 0;
        const failures = [];
        for (const guild of guildsToLeave) {
            try {
                await guild.leave();
                leftCount += 1;
            } catch (error) {
                logger.warn(`Could not leave unapproved server ${guild.id}:`, error);
                failures.push(`${guild.name} (${guild.id})`);
            }
        }

        const response = [`Left ${leftCount} unapproved server(s).`];
        if (failures.length > 0) {
            response.push(`Could not leave: ${failures.join(', ')}`);
        }
        return interaction.editReply(response.join('\n').slice(0, 1900));
    }
};