# Music Module Setup Guide

This guide will help you set up the music functionality for playing Spotify and YouTube playlists in your Discord bot.

## 📋 Overview

The music module includes:
- **play-playlist**: Play Spotify or YouTube playlists in voice channels
- **loop-playlist**: Toggle playlist looping (off, all, one)
- **musicService**: Core service handling playback logic

## 🚀 Installation

### Step 1: Install Required Packages

The music module requires the following packages (everything is installed via npm—no external software needed):

```bash
npm install @discordjs/voice discord-player play-dl ffmpeg-static
```

**What each package does:**
- `@discordjs/voice` - Manages voice channel connections
- `discord-player` - High-level music playback API
- `play-dl` - Extracts audio from YouTube and Spotify
- `ffmpeg-static` - Bundles FFmpeg as an npm dependency (no manual installation needed!)

### Step 2: Update package.json

After installation, your `package.json` dependencies should include:
```json
{
  "@discordjs/voice": "^0.16.x",
  "discord-player": "^6.x.x",
  "play-dl": "^1.10.x",
  "ffmpeg-static": "^5.x.x"
}
```

## 📝 Commands

### play-playlist
Plays a Spotify or YouTube playlist in your current voice channel.

**Usage:**
```
/play-playlist url: <playlist-url> shuffle: <true|false>
```

**Options:**
- `url` (required): The Spotify or YouTube playlist URL
- `shuffle` (optional): Shuffle the playlist (default: false)

**Example:**
```
/play-playlist url: https://www.youtube.com/playlist?list=PLxxxxxx shuffle: false
/play-playlist url: https://open.spotify.com/playlist/xxxxx shuffle: true
```

### loop-playlist
Toggles the looping mode for the current playlist.

**Usage:**
```
/loop-playlist mode: <off|all|one>
```

**Options:**
- `mode` (optional): Loop mode to set
  - `off`: No looping
  - `all`: Loop entire playlist (when playlist ends, restart from beginning)
  - `one`: Loop current song
  - If not specified, cycles through modes

**Example:**
```
/loop-playlist
/loop-playlist mode: all
/loop-playlist mode: one
```

## 🔧 Implementation Details

### Architecture

The music module uses:
- **discord.js 14+**: Discord API client
- **@discordjs/voice**: Voice channel connection management
- **discord-player**: High-level music playback API (recommended)
- **play-dl**: Alternative/supplementary audio source extraction

### File Structure

```
src/
├── commands/
│   └── Music/
│       ├── play-playlist.js      # Play command
│       └── loop-playlist.js      # Loop command
├── services/
│   └── musicService.js            # Core music logic
└── utils/
    └── embeds.js                  # Embed utilities (existing)
```

### Player State Management

Each guild has an associated player with:
```javascript
{
  guildId: string,              // Discord guild ID
  voiceConnection: any,         // Voice connection object
  queue: Track[],               // Array of tracks to play
  isPlaying: boolean,           // Playback status
  currentTrack: Track | null,   // Currently playing track
  loopMode: 'off' | 'all' | 'one',  // Loop mode
  shuffle: boolean              // Shuffle enabled
}
```

## 🛠️ Implementation Status

✅ **FULLY IMPLEMENTED** - The music module is complete and ready to use!

Simply install the required npm packages and the bot will handle everything automatically:
- Voice channel connections
- Playlist extraction from YouTube and Spotify
- Queue management
- Loop modes (off/all/one)
- Shuffle functionality

No additional configuration or setup required!

## 🛠️ What Changed (Skip this section - already done!)

## 📚 Useful Resources

- [discord.js Documentation](https://discord.js.org/)
- [@discordjs/voice Documentation](https://discordjs.guide/voice/)
- [discord-player Documentation](https://www.npmjs.com/package/discord-player)
- [play-dl Documentation](https://www.npmjs.com/package/play-dl)
- [FFmpeg Installation Guide](https://ffmpeg.org/download.html)

## ⚠️ Important Notes

1. **Voice Connection Permissions**: The bot needs `Connect` and `Speak` permissions in voice channels
2. **Rate Limiting**: Spotify and YouTube may rate limit requests; implement caching if needed
3. **Error Handling**: Always handle network errors gracefully (no internet, playlist deleted, etc.)
4. **Resource Management**: Properly disconnect from voice channels when done to prevent memory leaks
5. **npm Only**: All dependencies are installed via npm—no external software downloads required!

## 🐛 Troubleshooting

**"Cannot find ffmpeg"**
- If you see this error, run: `npm install ffmpeg-static --save`
- This is already included in the setup above, but can be installed separately

**"Module not found" errors**
- Clear node_modules and reinstall: 
  ```bash
  rm -r node_modules package-lock.json
  npm install
  ```
- Or on Windows: `rmdir /s node_modules && npm install`

**"No matching package found"**
- Clear npm cache: `npm cache clean --force`
- Try installing with `--save`: `npm install --save @discordjs/voice`

**"Bot can't connect to voice"**
- Check bot permissions in the server
- Ensure bot has `Connect` and `Speak` permissions
- Verify voice channel exists and bot can access it

**"Playlist not found"**
- Verify the URL is correct
- Ensure the playlist is public (not private)
- Try with a different playlist

## 📞 Support

For issues or questions, refer to:
- Discord.js Community: https://discord.gg/bRCvFy9
- discord-player Issues: https://github.com/skick1337/discord-player/issues
- play-dl Issues: https://github.com/play-dl/play-dl/issues
