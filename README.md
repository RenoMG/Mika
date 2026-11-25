# Mika

**An anime companion and server helper for Discord.** Look up anime, characters, and studios, show off your AniList or MyAnimeList profile, and play screenshot guessing games—with moderation, logging, and leveling in the same bot.

Created by [Reno](https://renos.world). Built with Node.js, discord.js, and MongoDB.

## What Mika does

| Feature | Try it |
| --- | --- |
| **Search** — anime, characters, and studios with live suggestions, Japanese titles, art, scores, and details | `/search query:Cowboy Bebop`, `/search type:Character query:Spike` |
| **Random anime** — a random well-rated show, optionally from one genre or tag | `/randomanime genre:Comedy` |
| **Profiles** — link your public AniList or MyAnimeList account and show it with `/profile`, or look up any public profile by username | `/link anilist`, `/profile`, `/findprofile site:AniList username:Kaz` |
| **Guess That Anime** — name the anime from a screenshot or a character from their portrait. Earn crystals and spend them on hints, packs, wagers, duels, Streak Shields and crystal boosts. Gift crystals to friends, unlock achievements, and compete in quarterly seasons | `/guess about`, `/guess play`, `/guess duel`, `/guess shop`, `/guess leaderboard` |
| **Anime memes** — image posts filtered for NSFW and spoiler flags | `/meme` |
| **Moderation** — warnings, kicks, bans, timed role mutes, message cleanup, and infraction records | `/warn`, `/mute`, `/ban`, `/clear`, `/infractions` |
| **Server tools** — welcome/farewell messages, auto-roles, activity logs, XP, rank cards, and leaderboards | `/config`, `/level`, `/leaderboard` |

Use `/help` for the full command list and examples. Slash commands run in servers.

## A quick tour

Look something up, then show your profile:

```text
/search query:進撃の巨人
/search type:Character query:Levi
/randomanime
/findprofile site:AniList username:YourName
/link anilist username:YourName
/profile
```

`/link` gives you a one-time code. Paste it into your AniList **About** (or MyAnimeList **About Me**), save, and press **Verify**. Discord will prompt for the required options; pick a suggestion to use its exact title.

For a server, run `/config`. It opens one private menu: the home screen sums up every setting, and picking a section from the dropdown lets you change it in place with buttons and pickers. `/config section:Guess That Anime` jumps straight to one section.

| Section | What it holds |
| --- | --- |
| 👋 Welcome | Greeting and farewell on/off, channels, and messages |
| 🧩 Features | Every whole-feature switch, each listing what it covers: moderation, anime lookups, memes, Guess That Anime, info & utility, leveling, and logging |
| 🚫 Restricted channels | Channels where Mika ignores commands and chat earns no XP |
| 📑 Logging | Log channel and on/off |
| 🎭 Roles | Auto-role for new members and the mute role |
| 🏆 Leveling | XP on/off, level-up channel, and message |
| 🎯 Guess That Anime | The game, automatic screenshot drops, their channel, and an interval from **10 minutes to 24 hours** (default 10 minutes) |

`/config` is only visible to, and only usable by, members with **Manage Server**.

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

   Put the bot's role above the roles and members it manages. `/config` requires Manage Server; changing auto-role or mute-role also requires Manage Roles. Those roles must be below both the editor and the bot, and cannot grant moderation or server-management permissions. `/mute` and `/unmute` require **Timeout Members**; `/ban` also accepts a user ID for someone who is not in the server.

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

## Profiles and search

- **Profiles are read-only windows onto AniList and MyAnimeList.** Mika stores only your Discord id and which public accounts you linked. Everything on `/profile` (watching, favorites, recent finishes, stats, bio) is fetched from the site when someone opens it and cached for 10 minutes. `/link remove` forgets an account right away.
- **Linking proves ownership.** `/link anilist` or `/link myanimelist` gives a one-time code (valid 30 minutes, 6 checks) to put in that profile's bio. Mika reads the public bio to check it, so no sign-in is needed. An account belongs to whoever proved it last.
- **`/profile` vs `/findprofile`.** `/profile` shows your linked account, or a linked member of the server you're in (`user:`). `/findprofile` looks up any public AniList or MyAnimeList profile by username, with no linking and nothing stored, so you can show your own profile without linking it.
- **Who sees replies.** Commands that show something people might share are public: profiles, search, `/guess stats` (including `user:` for anyone in the server), rank cards, leaderboards, and moderation actions. `/link`, `/config`, menus, `/infractions` lookups, and errors are private.
- **Untrusted data.** Everything from AniList and MyAnimeList is checked and cleaned before it is cached or shown: HTML, site markup, spoilers, mentions, links, and markdown are stripped, numbers must be in range, and adult titles are left out.
- Search uses [AniList](https://anilist.co). Submitted text searches can fall back to [Kitsu](https://kitsu.app). Suggestions use AniList IDs; they do not issue a fallback request they cannot use. Random fallback is available only when Kitsu can honor the selected filters.
- Anime providers exclude adult results; memes also filter source NSFW/spoiler flags. These filters depend on provider metadata.
- `/guess play` allows ten plays per user/server per rolling hour. Correct guesses normally earn 50 crystals. Personal rounds started Friday 12:00 AM through Sunday 11:59 PM Pacific earn **double crystals** (100 before hints), automatically across every server. Daylight saving time is handled automatically; XP, leveling, and the hourly limit stay the same. Use **🎲 Play again** after a personal round to start another without typing the command. Scheduled auto-drop rounds never show Play again, so a channel only gets the rounds its admins scheduled.
- Personal screenshots offer private **Genre (10 crystals)**, **Studio (20)**, and **Extra screenshot (25)** hint buttons, once each per round. Each purchased hint adds **10 seconds to the time remaining**, up to 60 seconds total with all three, and cuts winnings by 25 percentage points: 75%, 50%, then 25% of the base reward, rounded down. Hint prices never double. Unavailable hints are disabled, and only the round owner can buy them. Stuck? **🏳️ Give up** ends your personal round right away, reveals the answer, and offers **Play again** if you have rounds left. It earns no crystals. `/guess stats` shows wins, crystals, give ups, current win streak, and best streak; add `user:` to see another member of the server. Streaks count personal rounds won in a row; a timeout or give up resets yours.
- **Spend your crystals.** `/guess play mode:character` guesses a character instead. `pack:` limits a round to one genre or era (20 crystals). `wager:` stakes 10–500 crystals: win and it comes back doubled, lose and it's gone along with your streak. The **🔤 Letters** hint (30) shows the first letter of each word. `/guess shop` sells a **🛡️ Streak Shield** (75) that saves your streak once, and **⚡ 1-hour (150)** and **🌟 24-hour (600, up to 60 rounds)** boosts that double crystals on weekdays; `/guess inventory` shows what you hold and starts boosts. `/guess about` explains the whole game. `/guess duel` challenges a member to a head-to-head round for a shared pot (duels never touch streaks). `/guess gift` sends up to 500 crystals a day with no fee once you have 5 wins. `/guess achievements` lists 19 one-time bonuses.
- **Seasons** follow calendar quarters (Pacific time). `/guess leaderboard` shows the current season by default; at the end of each quarter the top three earn a 🥇🥈🥉 title shown on the leaderboard and in `/guess stats`.
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
