import { logger } from '../utils/logger.js';
import { Player } from 'discord-player';

/**
 * Music Service
 * Handles music playback, playlist management, and loop functionality
 * Uses discord-player for real YouTube and Spotify support
 */

class MusicService {
    constructor() {
        this.player = null;
        this.loopModes = new Map();
        this.initialized = false;
    }

    /**
     * Initialize the music player with a Discord client
     * @param {Client} client - Discord.js client
     */
    async initialize(client) {
        if (this.initialized) {
            return;
        }

        try {
            this.player = new Player(client, {
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 300000,
                leaveOnEnd: false,
                autoSelfDeaf: true,
                skipFFmpegCheck: false,
            });

            // Handle track end for looping
            this.player.on('trackEnd', (queue) => {
                const guildId = queue.guild.id;
                const loopMode = this.loopModes.get(guildId) || 'off';
                
                if (loopMode === 'all' && queue.tracks.length > 0) {
                    // Move first track to end to loop
                    const firstTrack = queue.tracks.shift();
                    queue.tracks.push(firstTrack);
                }
            });

            this.player.on('emptyQueue', (queue) => {
                logger.info(`Queue ended for guild ${queue.guild.id}`);
                this.loopModes.delete(queue.guild.id);
            });

            this.player.on('error', (queue, error) => {
                logger.error(`Music player error for guild ${queue.guild.id}:`, error);
            });

            this.player.on('connectionError', (queue, error) => {
                logger.error(`Connection error for guild ${queue.guild.id}:`, error);
            });

            this.initialized = true;
            logger.info('Music player initialized successfully');
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
     * @param {Interaction} interaction
     * @param {VoiceChannel} voiceChannel
     * @param {string} playlistUrl
     * @param {boolean} shuffle
     * @returns {Promise<Object>}
     */
    async playPlaylist(interaction, voiceChannel, playlistUrl, shuffle = false) {
        try {
            if (!this.player) {
                throw new Error('Music player not initialized');
            }

            const guildId = interaction.guildId;
            const source = this.getPlaylistSource(playlistUrl);

            if (source === 'unknown') {
                return {
                    success: false,
                    error: 'Unable to determine playlist source.'
                };
            }

            // Create or get queue
            let queue = this.player.getQueue(guildId);
            if (!queue) {
                queue = this.player.createQueue(guildId, {
                    metadata: {
                        voiceChannel: voiceChannel,
                        textChannel: interaction.channel,
                    },
                });
            }

            // Connect to voice channel if not connected
            if (!queue.connection) {
                await queue.connect(voiceChannel);
            }

            // Search for the playlist
            const searchResult = await this.player.search(playlistUrl, {
                requestedBy: interaction.user,
            });

            if (!searchResult || !searchResult.tracks || searchResult.tracks.length === 0) {
                return {
                    success: false,
                    error: 'Could not find any tracks in the playlist.'
                };
            }

            let tracks = searchResult.tracks;
            
            // Apply shuffle if requested
            if (shuffle) {
                tracks = tracks.sort(() => Math.random() - 0.5);
            }

            // Add tracks to queue
            queue.addTracks(tracks);

            // Play if not already playing
            if (!queue.playing) {
                await queue.play();
            }

            // Reset loop mode
            this.loopModes.set(guildId, 'off');

            logger.info(`Playing ${source} playlist in guild ${guildId}`, {
                url: playlistUrl,
                shuffle: shuffle,
                trackCount: tracks.length
            });

            return {
                success: true,
                source: source.toUpperCase(),
                trackCount: tracks.length,
                playlistUrl: playlistUrl
            };

        } catch (error) {
            logger.error('Error playing playlist:', error);
            return {
                success: false,
                error: `Failed to play playlist: ${error.message}`
            };
        }
    }

    /**
     * Set loop mode
     * @param {string} guildId
     * @param {string} mode
     * @returns {Object}
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
                    error: 'No music playing in this guild.'
                };
            }

            let newMode = mode;
            if (mode === 'toggle') {
                const currentMode = this.loopModes.get(guildId) || 'off';
                const modeOrder = ['off', 'all', 'one'];
                const currentIndex = modeOrder.indexOf(currentMode);
                newMode = modeOrder[(currentIndex + 1) % modeOrder.length];
            }

            // Apply loop mode
            switch (newMode) {
                case 'all':
                    queue.setRepeatMode(1); // discord-player loop all
                    break;
                case 'one':
                    queue.setRepeatMode(2); // discord-player loop one
                    break;
                case 'off':
                default:
                    queue.setRepeatMode(0); // no loop
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
     * Get player queue for a guild
     * @param {string} guildId
     * @returns {Queue|null}
     */
    getPlayer(guildId) {
        if (!this.player) {
            return null;
        }
        return this.player.getQueue(guildId) || null;
    }

    /**
     * Pause playback
     * @param {string} guildId
     * @returns {boolean}
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
     * @param {string} guildId
     * @returns {boolean}
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
     * Skip to next track
     * @param {string} guildId
     * @returns {Object}
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
                    error: 'No music playing.'
                };
            }

            queue.skip();

            const nextTrack = queue.current;
            return {
                success: true,
                currentTrack: nextTrack
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
     * Stop playback and disconnect
     * @param {string} guildId
     * @returns {boolean}
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
     * Get queue tracks
     * @param {string} guildId
     * @returns {Array}
     */
    getQueue(guildId) {
        if (!this.player) {
            return [];
        }

        const queue = this.player.getQueue(guildId);
        return queue ? queue.tracks : [];
    }

    /**
     * Get Discord player instance
     * @returns {Player|null}
     */
    getDiscordPlayer() {
        return this.player;
    }

    /**
     * Check if initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }
}

export const musicService = new MusicService();
