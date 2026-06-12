import { logger } from '../utils/logger.js';

/**
 * Music Service
 * Handles music playback simulation and state management
 * 
 * This is a lightweight implementation that doesn't require external music libraries.
 * For full audio playback with YouTube/Spotify support, consider upgrading to:
 * npm install @discordjs/voice discord-player play-dl ffmpeg-static
 */

class MusicService {
    constructor() {
        // Store active players per guild
        this.players = new Map();
        // Store playlist loop modes per guild
        this.loopModes = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the music service
     * Call this once when the bot starts up
     * @param {Client} client - Discord.js client
     */
    async initialize(client) {
        if (this.initialized) {
            return;
        }

        try {
            this.initialized = true;
            logger.info('Music service initialized (basic mode)');
        } catch (error) {
            logger.error('Failed to initialize music service:', error);
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
     * Play a playlist in a voice channel (simulated)
     * @param {Interaction} interaction - The interaction object
     * @param {VoiceChannel} voiceChannel - The voice channel to play in
     * @param {string} playlistUrl - The playlist URL
     * @param {boolean} shuffle - Whether to shuffle the playlist
     * @returns {Promise<Object>} - Result object with success status and details
     */
    async playPlaylist(interaction, voiceChannel, playlistUrl, shuffle = false) {
        try {
            const guildId = interaction.guildId;
            const source = this.getPlaylistSource(playlistUrl);

            if (source === 'unknown') {
                return {
                    success: false,
                    error: 'Unable to determine playlist source. Please provide a YouTube or Spotify playlist URL.'
                };
            }

            // Initialize player for this guild if not exists
            if (!this.players.has(guildId)) {
                this.players.set(guildId, {
                    guildId: guildId,
                    voiceChannel: voiceChannel,
                    queue: [],
                    isPlaying: true,
                    currentTrack: null,
                    loopMode: 'off',
                    shuffle: shuffle,
                    playlistUrl: playlistUrl,
                    source: source
                });
            }

            const player = this.players.get(guildId);
            player.isPlaying = true;
            player.shuffle = shuffle;
            player.loopMode = 'off';

            logger.info(`Playing ${source} playlist in guild ${guildId}`, {
                url: playlistUrl,
                shuffle: shuffle,
                channel: voiceChannel.name
            });

            return {
                success: true,
                source: source.toUpperCase(),
                trackCount: 'Unknown (basic mode)',
                playlistUrl: playlistUrl,
                note: 'Music playback simulation. For full YouTube/Spotify support, install: npm install @discordjs/voice discord-player play-dl ffmpeg-static'
            };

        } catch (error) {
            logger.error('Error playing playlist:', error);
            return {
                success: false,
                error: 'Failed to start playback.'
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
            const player = this.players.get(guildId);
            if (!player) {
                return {
                    success: false,
                    error: 'No player found for this guild.'
                };
            }

            let newMode = mode;
            if (mode === 'toggle') {
                // Cycle through modes: off -> all -> one -> off
                const modeOrder = ['off', 'all', 'one'];
                const currentIndex = modeOrder.indexOf(player.loopMode);
                newMode = modeOrder[(currentIndex + 1) % modeOrder.length];
            }

            player.loopMode = newMode;
            this.loopModes.set(guildId, newMode);

            logger.info(`Loop mode set to ${newMode} for guild ${guildId}`);

            return {
                success: true,
                mode: newMode,
                currentTrack: player.currentTrack ? player.currentTrack.title : null
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
     * Get the player for a specific guild
     * @param {string} guildId - The guild ID
     * @returns {Object|null} - Player object or null if not found
     */
    getPlayer(guildId) {
        return this.players.get(guildId) || null;
    }

    /**
     * Pause the current playback
     * @param {string} guildId - The guild ID
     * @returns {boolean} - True if successfully paused
     */
    pausePlayback(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                return false;
            }

            player.isPlaying = false;
            logger.info(`Paused playback for guild ${guildId}`);
            return true;

        } catch (error) {
            logger.error('Error pausing playback:', error);
            return false;
        }
    }

    /**
     * Resume playback
     * @param {string} guildId - The guild ID
     * @returns {boolean} - True if successfully resumed
     */
    resumePlayback(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                return false;
            }

            player.isPlaying = true;
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
            const player = this.players.get(guildId);
            if (!player) {
                return {
                    success: false,
                    error: 'No player found for this guild.'
                };
            }

            return {
                success: true,
                currentTrack: player.currentTrack,
                message: 'Skipped to next track'
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
     * Stop music playback and clean up resources
     * @param {string} guildId - The guild ID
     * @returns {boolean} - True if successfully stopped
     */
    stopPlayback(guildId) {
        try {
            const player = this.players.get(guildId);
            if (!player) {
                return false;
            }

            player.isPlaying = false;
            player.queue = [];
            player.currentTrack = null;
            player.loopMode = 'off';

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
        const player = this.players.get(guildId);
        return player ? player.queue : [];
    }

    /**
     * Clear the player data for a guild (cleanup)
     * @param {string} guildId - The guild ID
     */
    clearPlayer(guildId) {
        this.players.delete(guildId);
        this.loopModes.delete(guildId);
        logger.info(`Cleared player data for guild ${guildId}`);
    }

    /**
     * Get Discord player instance (compatibility method)
     * @returns {null} - Not used in basic mode
     */
    getDiscordPlayer() {
        return null;
    }

    /**
     * Check if initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }
}

// Export singleton instance
export const musicService = new MusicService();
