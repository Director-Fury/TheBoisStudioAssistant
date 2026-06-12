import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("pause-music")
        .setDescription("Pause the current music playback"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Pause-music interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            const guildId = interaction.guildId;

            // Check if there's an active player
            const player = musicService.getPlayer(guildId);
            if (!player || !player.isPlaying) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'No Music Playing',
                        description: 'There is no music currently playing in this server.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Pause playback
            const paused = musicService.pausePlayback(guildId);

            if (!paused) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: 'Failed to pause music playback.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = createEmbed({
                title: '⏸️ Music Paused',
                description: 'Playback has been paused. Use `/resume-music` to continue.',
                color: 'default'
            }).addFields(
                { name: 'Current Track', value: player.currentTrack?.title || 'Unknown', inline: true }
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Pause-music command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while pausing music playback.',
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
