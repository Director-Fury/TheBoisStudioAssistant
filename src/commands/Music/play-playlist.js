import { SlashCommandBuilder, ChannelType, MessageFlags } from 'discord.js';
import { createEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { musicService } from '../../services/musicService.js';

export default {
    data: new SlashCommandBuilder()
        .setName("play-playlist")
        .setDescription("Play a Spotify or YouTube playlist in your voice channel")
        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("The Spotify or YouTube playlist URL")
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option
                .setName("shuffle")
                .setDescription("Shuffle the playlist? (default: false)")
                .setRequired(false)
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Play-playlist interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
            });
            return;
        }

        try {
            // Check if user is in a voice channel
            const voiceChannel = interaction.member?.voice?.channel;
            if (!voiceChannel) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Error',
                        description: 'You must be in a voice channel to play music!',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const playlistUrl = interaction.options.getString("url");
            const shuffle = interaction.options.getBoolean("shuffle") ?? false;

            // Validate URL format
            if (!musicService.isValidPlaylistUrl(playlistUrl)) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Invalid URL',
                        description: 'Please provide a valid Spotify or YouTube playlist URL.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            // Start playing the playlist
            const result = await musicService.playPlaylist(interaction, voiceChannel, playlistUrl, shuffle);

            if (!result.success) {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'Playback Error',
                        description: result.error || 'Failed to play playlist.',
                        color: 'error'
                    })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            const embed = createEmbed({
                title: '🎵 Playlist Started',
                description: null,
                color: 'default'
            }).addFields(
                { name: 'Source', value: result.source, inline: true },
                { name: 'Tracks', value: `${result.trackCount || 'Unknown'} songs`, inline: true },
                { name: 'Channel', value: voiceChannel.name, inline: true },
                { name: 'Shuffle', value: shuffle ? 'Enabled' : 'Disabled', inline: true }
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
            });

        } catch (error) {
            logger.error('Play-playlist command error:', error);
            try {
                return await InteractionHelper.safeReply(interaction, {
                    embeds: [createEmbed({
                        title: 'System Error',
                        description: 'An error occurred while trying to play the playlist.',
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
