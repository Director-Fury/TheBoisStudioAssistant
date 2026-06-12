import { logger } from '../utils/logger.js';
import { Player } from 'discord-player';

/**
 * Music Service
 * Handles music playback, playlist management, and loop functionality
 * 
 * NOTE: This service requires the following packages to be installed:
 * - @discordjs/voice: For voice channel connection management
 * - discord-player: For music playback
 * - play-dl: For extracting YouTube and Spotify tracks
 * - ffmpeg-static: Bundles FFmpeg as an npm dependency (no manual installation needed)
 * 
 * Installation:
 * npm install @discordjs/voice discord-player play-dl ffmpeg-static
 */

class MusicService {
    constructor() {
        this.player = null;
        // Store loop modes per guild
        this.loopModes = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the music player with a Discord client
     * Call this once when the bot starts up
     * @param {Client} client - Discord.js client
     */
    async initialize(client) {
        if (this.initialized) {
            return;
        }

        try {
            this.player = new Player(client, {
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 300000, // 5 minutes
                leaveOnEnd: false,
                autoSelfDeaf: true,
                skipFFmpegCheck: false,
            });

            // Handle queue end
            this.player.on('emptyQueue', (queue) => {
                logger.info(`Queue ended for guild ${queue.guild.id}`);
                this.loopModes.delete(queue.guild.id);
            });

            // Handle errors
            this.player.on('error', (queue, error) => {
                logger.error(`Music player error for guild ${queue.guild.id}:`, error);
            });

            // Handle connection errors
            this.player.on('connectionError', (queue, error) => {
                logger.error(`Connection error for guild ${queue.guild.id}:`, error);
            });

            this.initialized = true;
            logger.info('Music player initialized');
        } catch (error) {
            logger.error('Failed to initialize music player:', error);
            throw error;
        }
    }

    /**
     * Validate if a URL is a valid Spotify or YouTube playlist URL
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if valid playlist URL
     */
    isValidPlaylistUrl(url) {
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();

            // YouTube playlist validation
            if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
                return urlObj.searchParams.has('list') || url.includes('playlist');
            }

            // Spotify playlist validation
            if (hostname.includes('spotify.com')) {
                return url.includes('/playlist/') || urlObj.pathname.includes('playlist');
            }

            return false;
        } catch (error) {
            logger.error('URL validation error:', error);
            return false;
        }
    }

    /**
     * Determine the playlist source (YouTube or Spotify)
     * @param {string} url - The playlist URL
     * @returns {string} - Source type ('youtube', 'spotify', or 'unknown')
     */
    getPlaylistSource(url) {
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
                return 'youtube';
            }
            if (hostname.includes('spotify.com')) {
                return 'spotify';
            }
            return 'unknown';
        } catch (error) {
            return 'unknown';
        }
    }

    /**
     * Play a playlist in a voice channel
     * @param {Interaction} interaction - The interaction object
     * @param {VoiceChannel} voiceChannel - The voice channel to play in
     * @param {string} playlistUrl - The playlist URL
     * @param {boolean} shuffle - Whether to shuffle the playlist
     * @returns {Promise<Object>} - Result object with success status and details
     */
    async playPlaylist(interaction, voiceChannel, playlistUrl, shuffle = false) {
        try {
            if (!this.player) {
                throw new Error('Music player not initialized. Call initialize() first.');
            }

            const guildId = interaction.guildId;
            const source = this.getPlaylistSource(playlistUrl);

            if (source === 'unknown') {
                return {
                    success: false,
                    error: 'Unable to determine playlist source. Please provide a YouTube or Spotify playlist URL.'
                };
            }

            // Search and play the playlist
            const queue = this.player.createQueue(interaction.guild, {
                metadata: {
                    voiceChannel: voiceChannel,
                    textChannel: interaction.channel,
                },
            });

            // Connect to voice channel if not already connected
            if (!queue.connection) {
                await queue.connect(voiceChannel);
            }

            // Search for and play the playlist
            const searchResult = await this.player.search(playlistUrl, {
                requestedBy: interaction.user,
            });

            if (!searchResult || !searchResult.tracks || searchResult.tracks.length === 0) {
                return {
                    success: false,
                    error: 'Could not find any tracks in the playlist. Make sure the playlist is public and the URL is correct.'
                };
            }

            const tracks = searchResult.tracks;
            const trackCount = tracks.length;

            // Add tracks to queue
            if (shuffle) {
                // Shuffle the tracks
                const shuffled = tracks.sort(() => Math.random() - 0.5);
                queue.addTracks(shuffled);
            } else {
                queue.addTracks(tracks);
            }

            // Start playing if not already playing
            if (!queue.playing) {
                await queue.play();
            }

            // Reset loop mode for new playlist
            this.loopModes.set(guildId, 'off');

            logger.info(`Playing ${source} playlist in guild ${guildId}`, {
                url: playlistUrl,
                shuffle: shuffle,
                trackCount: trackCount
            });

            return {
                success: true,
                source: source.toUpperCase(),
                trackCount: trackCount,
                playlistUrl: playlistUrl
            };

        } catch (error) {
            logger.error('Error playing playlist:', error);
            return {
                success: false,
                error: 'Failed to play playlist. Please check the URL and try again.'
            };
        }
    }

    /**
     * Set the loop mode for the current playlist
     * @param {string} guildId - The guild ID
     * @param {string} mode - Loop mode ('off', 'all', 'one', or 'toggle')
     * @returns {Object} - Result object with success status and new mode
     */
    setLoopMode(guildId, mode = 'toggle') {
        try {
            if (!this.player) {
                return {
                    success: false,
                    error: 'Music player not initialized.'
                };
            }

            const queue = this.player.getQueue(guildId);
            if (!queue || !queue.playing) {
                return {
                    success: false,
                    error: 'No player found for this guild or music is not playing.'
                };
            }

            let newMode = mode;
            if (mode === 'toggle') {
                // Cycle through modes: off -> all -> one -> off
                const currentMode = this.loopModes.get(guildId) || 'off';
                const modeOrder = ['off', 'all', 'one'];
                const currentIndex = modeOrder.indexOf(currentMode);
                newMode = modeOrder[(currentIndex + 1) % modeOrder.length];
            }

            // Apply the loop mode to discord-player
            switch (newMode) {
                case 'all':
                    queue.setRepeatMode(1); // Loop all (discord-player mode 1)
                    break;
                case 'one':
                    queue.setRepeatMode(2); // Loop one (discord-player mode 2)
                    break;
                case 'off':
                default:
                    queue.setRepeatMode(0); // No loop (discord-player mode 0)
                    break;
            }

            this.loopModes.set(guildId, newMode);

            logger.info(`Loop mode set to ${newMode} for guild ${guildId}`);

            const currentTrack = queue.current;
            return {
                success: true,
                mode: newMode,
                currentTrack: currentTrack ? currentTrack.title : null
            };

        } catch (error) {
            logger.error('Error setting loop mode:', error);
            return {
                success: false,
                error: 'Failed to set loop mode.'
            };
        }
    }

    /**
     * Get the player queue for a specific guild
     * @param {string} guildId - The guild ID
     * @returns {Queue|null} - Queue object or null if not found
     */
    getPlayer(guildId) {
        if (!this.player) {
            return null;
        }
        return this.player.getQueue(guildId) || null;
    }

    /**
     * Pause playback
     * @param {string} guildId - The guild ID
     * @returns {boolean} - True if successfully paused
     */
    pausePlayback(guildId) {
        try {
            if (!this.player) {
                return false;
            }

            const queue = this.player.getQueue(guildId);
            if (!queue || !queue.playing) {
                return false;
            }

            queue.setPaused(true);
            logger.info(`Paused playback for guild ${guildId}`);
            return true;

        } catch (error) {
            logger.error('Error pausing playback:', error);
            return false;
        }
    }

    /**
     * Resume playback
     * @param {string} guildId - The Guild ID
     * @returns {boolean} - True if successfully resumed
     */
    resumePlayback(guildId) {
        try {
            if (!this.player) {
                return false;
            }

            const queue = this.player.getQueue(guildId);
            if (!queue) {
                return false;
            }

            queue.setPaused(false);
            logger.info(`Resumed playback for guild ${guildId}`);
            return true;

        } catch (error) {
            logger.error('Error resuming playback:', error);
            return false;
        }
    }

    /**
     * Skip to the next track in the queue
     * @param {string} guildId - The guild ID
     * @returns {Object} - Result object with next track info
     */
    skipTrack(guildId) {
        try {
            if (!this.player) {
                return {
                    success: false,
                    error: 'Music player not initialized.'
                };
            }

            const queue = this.player.getQueue(guildId);
            if (!queue || !queue.playing) {
                return {
                    success: false,
                    error: 'No player found for this guild or music is not playing.'
                };
            }

            queue.skip();

            const nextTrack = queue.current;
            return {
                success: true,
                currentTrack: nextTrack || null
            };

        } catch (error) {
            logger.error('Error skipping track:', error);
            return {
                success: false,
                error: 'Failed to skip track.'
            };
        }
    }

    /**
     * Stop music playback and leave the voice channel
     * @param {string} guildId - The guild ID
     * @returns {boolean} - True if successfully stopped
     */
    stopPlayback(guildId) {
        try {
            if (!this.player) {
                return false;
            }

            const queue = this.player.getQueue(guildId);
            if (!queue) {
                return false;
            }

            queue.destroy();
            this.loopModes.delete(guildId);

            logger.info(`Stopped playback for guild ${guildId}`);
            return true;

        } catch (error) {
            logger.error('Error stopping playback:', error);
            return false;
        }
    }

    /**
     * Get the current queue for a guild
     * @param {string} guildId - The guild ID
     * @returns {Array} - Array of track objects in the queue
     */
    getQueue(guildId) {
        if (!this.player) {
            return [];
        }

        const queue = this.player.getQueue(guildId);
        return queue ? queue.tracks : [];
    }

    /**
     * Get the Discord player instance
     * @returns {Player|null} - The Player instance or null
     */
    getDiscordPlayer() {
        return this.player;
    }

    /**
     * Check if the music player is initialized
     * @returns {boolean} - True if initialized
     */
    isInitialized() {
        return this.initialized;
    }
}

// Export singleton instance
export const musicService = new MusicService();
