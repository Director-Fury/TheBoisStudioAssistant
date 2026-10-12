import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("stop-music")
        .setDescription("Stop music playback and disconnect from the voice channel"),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Stop-music interaction defer failed`, {
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

            // Stop playback
            const stopped = musicService.stopPlayback(guildId);

            if (!stopped) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: 'Failed to stop music playback.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = createEmbed({
                title: '⏹️ Music Stopped',
                description: 'Playback has been stopped and the bot has disconnected from the voice channel.',
                color: 'default'
            });

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Stop-music command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while stopping music playback.',
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
