# Mika

**An anime companion and server helper for Discord.** Search for shows, build an anime profile, trade recommendations, and play screenshot guessing games—with moderation, logging, and leveling in the same bot.

Created by [Reno](https://renos.world). Built with Node.js, discord.js, and MongoDB.

## What Mika does

| Feature | Try it |
| --- | --- |
| **Anime search** — live suggestions, Japanese titles, cover art, scores, and show details | `/search query:Cowboy Bebop` |
| **Random anime** — discover a show using your saved preferences or a selected genre/tag | `/randomanime genre:Comedy` |
| **Anime profiles** — a bio, five favorites, genres, and tags | `/setup`, `/bio`, `/favorite add`, `/genres` |
| **Watch tracking** — keep up to 20 watching entries and 500 completed shows | `/watching add`, `/watching complete`, `/completed list` |
| **Recommendations** — send a show to another server member; they accept or decline in DMs | `/recommend` |
| **Profile discovery** — view a server member's profile or find people who opted into discovery | `/profile`, `/findprofile` |
| **Guess That Anime** — identify an anime from a screenshot in 30 seconds; earn wins and crystals | `/guess play`, `/guess stats`, `/guess leaderboard` |
| **Anime memes** — image posts filtered for NSFW and spoiler flags | `/meme` |
| **Moderation** — warnings, kicks, bans, timed role mutes, message cleanup, and infraction records | `/warn`, `/mute`, `/ban`, `/clear`, `/infractions` |
| **Server tools** — welcome/farewell messages, auto-roles, activity logs, XP, rank cards, and leaderboards | `/config`, `/level`, `/leaderboard` |

Use `/help` for the full command list and examples. Slash commands run in servers; recommendation buttons work in DMs.

## A quick tour

Create a profile, then start a list:

```text
/setup
/bio
/search query:進撃の巨人
/watching add
/favorite add
/randomanime
```

Discord will prompt for the required options. Pick an anime suggestion to use its exact title. `/bio` shows an **Edit bio** button that opens the editor.

For a server, open `/config welcome`, `/config logging`, or `/config leveling` and use the menus. `/config guess` enables automatic screenshot rounds in a chosen channel. Choose an interval from **10 minutes to 24 hours**; the default is 10 minutes. `/config info` shows the current settings.

## Run your own Mika

You need **Node.js 22 or newer**, a MongoDB database, and a Discord bot application. Node 22 and 24 are covered by CI.

1. **Clone and install.**

   ```sh
   git clone https://github.com/RenoMG/Mika.git
   cd Mika
   npm ci
   cp .env.example .env
   ```

2. **Fill in `.env`.** Keep tokens and database credentials private.

   | Variable | Purpose |
   | --- | --- |
   | `TOKEN` | Discord bot token — required |
   | `APPLICATIONID` | Discord application ID — required |
   | `MIKADATABASE` | Main MongoDB connection URI — required |
   | `MIKADATABASENAME` | Database name; defaults to `mika`, overriding the URI's database name |
   | `MONGO_CACHE_URI` | Optional persistent anime cache, using database `mika-cache` |
   | `MIKAICON` | Optional public image URL for embed footers |

   The main database stores profiles, server settings, moderation records, XP, and game progress. Public anime metadata also has a bounded memory cache, so a second MongoDB cluster is optional. See [.env.example](.env.example) for all settings.

3. **Configure Discord.** In the [Developer Portal](https://discord.com/developers/applications), enable **Server Members Intent** and **Message Content Intent** under your application's **Bot** page, then save. The guessing game reads guesses from channel messages.

   Invite the bot using the `bot` and `applications.commands` scopes. Give it View Channel, Send Messages, Send Messages in Threads, Embed Links, Attach Files, and Read Message History. Add Manage Messages, Manage Roles, Kick Members, Ban Members, and View Audit Log for the corresponding server features. Administrator is not required.

   Put the bot's role above the roles and members it manages. `/config` requires Manage Server; changing auto-role or mute-role also requires Manage Roles. Those roles must be below both the editor and the bot, and cannot grant moderation or server-management permissions.

4. **Prepare the database and register commands.**

   ```sh
   npm run db:check
   npm run db:migrate
   npm run deploy:commands
   ```

   **Upgrading an existing installation?** Stop the bot, back up its database, and follow the [upgrade guide](docs/maintenance.md#upgrading-an-existing-bot) first. Migration stops if duplicate records need reconciliation; it never deletes them automatically.

5. **Start Mika.**

   ```sh
   npm start
   ```

   Register commands again after changing command definitions. Normal restarts do not redeploy them. Use a process manager or service supervisor to restart the bot after a fatal error.

## Profiles, recommendations, and search

- **Discoverable** controls profile search across servers. Profiles remain visible through `/profile` to people in the same server. `/settings` changes discovery and recommendation preferences or deletes your profile.
- Recommendations require the recipient to opt in. Senders have a five-minute cooldown; recipients can receive five recommendation/“list full” notifications per UTC day. A full watching list leaves acceptance retryable after making room.
- Search uses [AniList](https://anilist.co). Submitted text searches can fall back to [Kitsu](https://kitsu.app). Suggestions and saved lists use AniList IDs; they do not issue a fallback request they cannot use. Random fallback is available only when Kitsu can honor the selected filters.
- Anime providers exclude adult results; memes also filter source NSFW/spoiler flags. These filters depend on provider metadata.
- `/guess play` allows ten plays per user/server per rolling hour. Correct guesses earn 50 crystals. Use **🎲 Play again** after a round to start another without typing the command.
- Close guesses get a short public reply. Name the specific season or movie, and reply to the screenshot (or Mika's hint) for feedback on any answer. Ordinary spelling mistakes are forgiven; wrong installment numbers are not.
- Automatic rounds are staggered and queued to avoid a rush of requests. Your chosen interval is a minimum, so a round can arrive a little later. See [game timing and cache behavior](docs/maintenance.md#guessing-game).
- Screenshots come from [Shikimori](https://shikimori.io).

## Development

```sh
npm run lint
npm test
```

Tests start temporary local MongoDB instances and mock Discord/provider actions. They do not need real bot credentials. The first run downloads a MongoDB test binary.

See [maintenance and architecture notes](docs/maintenance.md) for cache limits, upgrade details, diagnostics, and operational considerations.

Licensed under [GPL-3.0](LICENSE).
