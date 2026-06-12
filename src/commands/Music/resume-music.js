import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("resume-music")
        .setDescription("Resume music playback"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Resume-music interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            const guildId = interaction.guildId;

            // Check if there's an active player
            const player = musicService.getPlayer(guildId);
            if (!player) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'No Music Available',
                        description: 'There is no music player in this server. Use `/play-playlist` to start playing music.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Resume playback
            const resumed = musicService.resumePlayback(guildId);

            if (!resumed) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: 'Failed to resume music playback.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = createEmbed({
                title: '▶️ Music Resumed',
                description: 'Playback has been resumed.',
                color: 'default'
            }).addFields(
                { name: 'Current Track', value: player.currentTrack?.title || 'Unknown', inline: true }
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Resume-music command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while resuming music playback.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            } catch (replyError) {
                logger.error('Failed to send error reply:', replyError);
            }
        }
    },
};
