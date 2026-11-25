# Disabled Features

These command sections are intentionally kept outside `src/commands`, which is
the directory scanned by the command loader. Commands stored here are not
loaded or registered with Discord.

Disabled sections:

- Birthday
- Fun
- Leveling
- Music
- Verification

The Economy command section has been reactivated. The previously removed
`/slut` command remains excluded.

To restore a section, move its directory back into `src/commands` and restart
the bot.
