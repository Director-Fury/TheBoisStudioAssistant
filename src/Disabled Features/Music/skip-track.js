import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("skip-track")
        .setDescription("Skip to the next track in the playlist"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Skip-track interaction defer failed`, {
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

            // Skip to next track
            const result = musicService.skipTrack(guildId);

            if (!result.success) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: result.error || 'Failed to skip track.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = createEmbed({
                title: '⏭️ Track Skipped',
                description: 'Skipped to the next track in the playlist.',
                color: 'default'
            }).addFields(
                { name: 'Current Track', value: result.currentTrack?.title || 'Loading...', inline: true }
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Skip-track command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while skipping the track.',
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
