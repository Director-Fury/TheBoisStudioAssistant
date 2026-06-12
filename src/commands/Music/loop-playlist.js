import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("loop-playlist")
        .setDescription("Toggle looping for the current playlist")
        .addStringOption(option =>
            option
                .setName("mode")
                .setDescription("Loop mode")
                .setRequired(false)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'All', value: 'all' },
                    { name: 'One', value: 'one' }
                )
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Loop-playlist interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            const guildId = interaction.guildId;
            const mode = interaction.options.getString("mode") || 'toggle';

            // Check if there's an active playlist
            const player = musicService.getPlayer(guildId);
            if (!player || !player.isPlaying) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'No Music Playing',
                        description: 'There is no playlist currently playing in this server.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Update loop mode
            const result = musicService.setLoopMode(guildId, mode);

            if (!result.success) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: result.error || 'Failed to update loop mode.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const modeEmoji = {
                'off': '⏹️',
                'all': '🔄',
                'one': '🔂'
            };

            const embed = createEmbed({
                title: '🎵 Loop Mode Updated',
                description: null,
                color: 'default'
            }).addFields(
                { name: 'Mode', value: `${modeEmoji[result.mode]} ${result.mode.toUpperCase()}`, inline: true },
                { name: 'Current Track', value: result.currentTrack || 'Unknown', inline: true }
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Loop-playlist command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while updating the loop mode.',
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
