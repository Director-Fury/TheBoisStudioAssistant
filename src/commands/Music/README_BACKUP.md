# 🎵 Music Module

## ⚡ Quick Start

The music module is **ready to use immediately** on Railway! No downloads or local setup required.

```
/play-playlist url: https://youtube.com/playlist?list=PLxxxxx
/loop-playlist mode: all
/pause-music
/resume-music
/skip-track
/stop-music
```

## 🚀 Current Mode: Lightweight (No Audio Yet)

✅ **What Works:**
- All commands available immediately
- Playlist URL validation (YouTube & Spotify)
- Loop mode cycling (off → all → one)
- Pause/Resume/Skip controls
- Graceful error handling
- No external dependencies needed
- **Deploys instantly on Railway**

⚠️ **Limitation:**
- Audio playback is **simulation mode** (responds to commands but no actual audio)
- Perfect for testing commands and UX

## 🎯 Enable Full Audio Playback (Optional)

To add **real YouTube/Spotify audio playback**, you'll need to run one command locally:

### One-Time Setup on Your Machine

1. **Install Node.js** (if you haven't): https://nodejs.org/ (LTS version)

2. **Open PowerShell and run:**
   ```powershell
   cd "C:\Users\Eckho\Documents\TheBoisStudioAssistant"
   npm install @discordjs/voice discord-player play-dl ffmpeg-static
   ```

3. **Commit and push:**
   ```powershell
   git add package.json package-lock.json
   git commit -m "Add music audio playback support"
   git push
   ```

4. **Railway redeploys automatically** with full audio support!

---

That's it! After pushing the lock file, Railway handles everything else.

## 📝 Commands Reference

### /play-playlist
Play a Spotify or YouTube playlist

**Options:**
- `url` (required): Playlist URL
- `shuffle` (optional): true/false

**Examples:**
```
/play-playlist url: https://www.youtube.com/playlist?list=PLxxxxx
/play-playlist url: https://open.spotify.com/playlist/xxxxx shuffle: true
```

### /loop-playlist
Toggle loop mode for current playlist

**Options:**
- `mode` (optional): off, all, one, or leave blank to cycle

**Examples:**
```
/loop-playlist
/loop-playlist mode: all
/loop-playlist mode: one
```

### /pause-music
Pause current playback

### /resume-music
Resume paused playback

### /skip-track
Skip to next track

### /stop-music
Stop playback and disconnect

## 📋 Architecture

```
src/commands/Music/
├── play-playlist.js
├── loop-playlist.js
├── pause-music.js
├── resume-music.js
├── skip-track.js
├── stop-music.js
└── README.md (this file)

src/services/
└── musicService.js (manages state & playback)
```

## 🔄 How It Works

1. **Basic Mode (Current):** Commands validate URLs and manage playback state in memory
2. **Full Mode (Optional):** After `npm install`, audio actually streams to voice channels

Both modes use the same command interface—switching is seamless!

## 🐛 Troubleshooting

**Q: Do I need to do anything to use music on Railway?**
A: No! Just run the bot and use the `/play-playlist` command.

**Q: Why no audio in basic mode?**
A: To avoid downloading 60+ packages, this mode simulates playback without actual audio.

**Q: How do I enable audio playback?**
A: Run the "One-Time Setup" section above and push to GitHub. Railway rebuilds automatically.

**Q: Will I lose data if I upgrade to full audio?**
A: No! All commands keep the same interface. Just push the updated `package-lock.json`.

## 📚 Full Audio Mode Requirements

When you enable full audio (optional), the bot uses:
- **discord-player** - High-level music playback API
- **@discordjs/voice** - Voice channel connections  
- **play-dl** - YouTube/Spotify track extraction
- **ffmpeg-static** - Audio processing (no system install needed!)

These are all managed by npm—no system software to download!

---

**Status:** ✅ Ready to deploy right now | ✨ Optional audio upgrade available
