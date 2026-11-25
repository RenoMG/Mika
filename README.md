# Mika

**An anime companion and server helper for Discord.** Search for shows, build an anime profile, trade recommendations, and play screenshot guessing games—with moderation, logging, and leveling in the same bot.

Created by [Reno](https://renos.world). Built with Node.js, discord.js, and MongoDB.

## What Mika does

| Feature | Try it |
| --- | --- |
| **Anime search** — live suggestions, Japanese titles, cover art, scores, and show details | `/search query:Cowboy Bebop` |
| **Random anime** — discover a show using your saved preferences or a selected genre/tag | `/randomanime genre:Comedy` |
| **Anime profiles** — a bio, five favorite anime, favorite characters, staff, and studios, genres, tags, and a stats summary | `/setup`, `/bio`, `/favorite add`, `/favorite character add`, `/genres` |
| **Anime list** — Watching, Planning, Completed, Rewatching, Paused, and Dropped, with episode progress, scores (0.1–10), private notes, dates, and rewatch counts | `/watching progress`, `/planning add`, `/animelist set`, `/animelist edit`, `/animelist view` |
| **Stats and custom lists** — episodes and days watched, mean score, score spread, top genres; up to 10 named lists | `/animelist stats`, `/customlist create` |
| **AniList import** — bring over your public AniList list, favorites, and custom lists after proving the account is yours | `/import anilist` |
| **Watch Feed** — opt in to share list updates in a server's feed channel, and follow people to get theirs by DM | `/settings activity:True`, `/feed follow`, `/config feed` |
| **Recommendations** — send a show to another server member; they accept or decline in DMs, and accepted shows go to Planning | `/recommend` |
| **Profile discovery** — view a server member's profile or find people who opted into discovery | `/profile`, `/findprofile` |
| **Guess That Anime** — identify an anime from a screenshot; start with 30 seconds and earn wins and crystals | `/guess play`, `/guess stats`, `/guess leaderboard` |
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
/planning add
/watching add
/watching progress
/animelist edit
/favorite add
/randomanime
```

Already on AniList? Run `/import anilist username:YourName`, paste the code Mika gives you into your AniList bio, and press **Verify and import**.

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

- **Visibility** is **🏠 Local** or **🌐 Global**. A Local profile can be opened and found (with `/profile` or `/findprofile`) only by people who share a server with you. A Global profile can also be found with `/findprofile` from any server, even without a shared one. Choose it in `/setup`; `/settings` changes visibility and recommendation preferences or deletes your profile. (Stored as `discoverable`, where `true` means Global.)
- **Your list** has six statuses: Watching, Planning, Completed, Rewatching, Paused, and Dropped. A show is on one at a time; adding it somewhere else moves it with its progress, score, notes, and dates. `/watching progress` with no episode adds one, and logging the last episode marks the show completed. Finishing a rewatch counts it in the show's rewatch total. Notes are private: only you see them, even on `/animelist entry`. Lists hold up to 50 Watching, 50 Rewatching, 200 Paused, 500 Planning, 500 Dropped, and 2,000 Completed shows, plus 10 custom lists of 100 shows each.
- **AniList import** reads only your public anime list. To prove the account is yours, Mika gives you a one-time code (valid 30 minutes, 6 checks) to put in your AniList bio; Mika reads the bio through AniList's public API, so no AniList sign-in is needed. Merge mode (default) keeps shows that are only on Mika; Replace makes your six lists match AniList. 💌 recommendation marks survive both. Private entries and adult titles are skipped, and every imported value is checked and cleaned (mentions, links, and markdown are stripped; numbers and dates must be in range). Once linked, `/import anilist` with the same name syncs again without a code, at most once every 10 minutes.
- **Watch Feed.** A server admin picks a channel with `/config feed`. Members who turn on `/settings activity:True` get their list updates posted there: new shows, progress, scores, finishes. With `/settings follows:True`, people who can see your profile can `/feed follow` you and get the same updates by DM, each with an Unfollow button. Updates to one show within 90 seconds are merged into one post. Turning followers off removes your current followers. A follow is dropped after three undeliverable DMs.
- **Who sees replies.** Commands that show something people might share are public: profiles, lists, `/animelist stats` and `entry`, `/guess stats` (including `user:` for anyone in the server), rank cards, leaderboards, search, and moderation actions. Changing your own data, settings, menus, `/config`, and `/infractions` lookups are private, as are errors.
- Recommendations require the recipient to opt in. Senders have a five-minute cooldown; recipients can receive five recommendation/“list full” notifications per UTC day. Accepted recommendations land on your Planning list with a 💌 mark (a show already on one of your lists keeps its status and just gets the mark). A full Planning list leaves acceptance retryable after making room.
- Search uses [AniList](https://anilist.co). Submitted text searches can fall back to [Kitsu](https://kitsu.app). Suggestions and saved lists use AniList IDs; they do not issue a fallback request they cannot use. Random fallback is available only when Kitsu can honor the selected filters.
- Anime providers exclude adult results; memes also filter source NSFW/spoiler flags. These filters depend on provider metadata.
- `/guess play` allows ten plays per user/server per rolling hour. Correct guesses normally earn 50 crystals. Personal rounds started Friday 12:00 AM through Sunday 11:59 PM Pacific earn **double crystals** (100 before hints), automatically across every server. Daylight saving time is handled automatically; XP, leveling, and the hourly limit stay the same. Use **🎲 Play again** after a personal round to start another without typing the command. Scheduled auto-drop rounds never show Play again, so a channel only gets the rounds its admins scheduled.
- Personal screenshots offer private **Genre (10 crystals)**, **Studio (20)**, and **Extra screenshot (25)** hint buttons, once each per round. Each purchased hint adds **10 seconds to the time remaining**, up to 60 seconds total with all three, and cuts winnings by 25 percentage points: 75%, 50%, then 25% of the base reward, rounded down. Hint prices never double. Unavailable hints are disabled, and only the round owner can buy them. Stuck? **🏳️ Give up** ends your personal round right away, reveals the answer, and offers **Play again** if you have rounds left. It earns no crystals. `/guess stats` shows wins, crystals, give ups, current win streak, and best streak; add `user:` to see another member of the server. Streaks count personal rounds won in a row; a timeout or give up resets yours.
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
