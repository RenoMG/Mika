# Mika

Multi-purpose Discord bot (moderation, logging, configuration, leveling, and anime).

## Requirements

- **Node.js 26 LTS** (Active LTS, “Lithium”). Node.js 22 and 24 are still supported LTS lines and satisfy `engines` (`>=22`).
- A Discord application and bot user.
- A MongoDB database.

## Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy the environment template and fill it in. Do not commit `.env`.

   ```sh
   cp .env.example .env
   ```

   | Variable | Required | Purpose |
   | --- | --- | --- |
   | `TOKEN` | yes | Bot token from the Discord Developer Portal > Bot |
   | `APPLICATIONID` | yes | Application ID from the Discord Developer Portal > General Information. Used to register slash commands on startup |
   | `MIKADATABASE` | yes | MongoDB connection string for configuration, infractions, warnings, and leveling. Shape: `mongodb+srv://USER:PASSWORD@HOST/DATABASE?tls=true&authSource=admin&tlsCAFile=./ca-certificate.crt`. Download the CA from the database dashboard and do not commit it |
   | `MIKADATABASENAME` | no | Database name passed to `mongoose.connect` (`dbName`). Defaults to `mika` and overrides any database name in `MIKADATABASE`. When this is unset and the URI does not name a database, MongoDB uses `test` |
   | `MONGO_CACHE_URI` | no | Second MongoDB cluster for anime caches only (AniList details, search lists, and the Guess That Anime pool). Example: `mongodb+srv://USER:PASSWORD@CACHE_HOST/?retryWrites=true&w=majority`. Mika uses database `mika-cache` on that cluster. When unset, lookups use live AniList and Kitsu. Do not commit a real URI |
   | `MIKAICON` | no | Public image URL for the embed footer icon. When unset, embeds use `https://renos.world/wp-content/uploads/2025/10/5a4e299d7d70aace-952x1024.jpg` |

   Legacy `RODGERDATABASE` and `RODGERICON` still work when the Mika names are unset. An old Discord CDN avatar URL for this application is replaced with that placeholder.

   Mika connects with `dbName: process.env.MIKADATABASENAME || 'mika'`. Older runs that omitted a database name stored `configurationdbs`, `infractionsdbs`, `levels`, and `warndbs` in MongoDB's default database, `test`. Those documents are not moved. Leave `MIKADATABASENAME` unset to use `mika` (copy the old collections across yourself if you need them), or set `MIKADATABASENAME=test` to keep reading `test`. Restart the bot after changing it.

   `.gitignore` blocks `.env`, private keys, and certificate files (`*.pem`, `*.key`, `*.crt`, `*.cer`, `*.csr`, `*.p12`, `*.pfx`, and similar). Do not force-add them.

3. In the [Discord Developer Portal](https://discord.com/developers/applications):

   - Bot → Privileged Gateway Intents. Enable both, then click **Save Changes** before you start or restart Mika:
     - **Server Members Intent** (`GuildMembers`)
     - **Message Content Intent** (`MESSAGE CONTENT INTENT`)
   - Guess That Anime reads guesses people type in the channel. The exact portal path is: Developer Portal → Applications → Mika → Bot → Privileged Gateway Intents → enable **MESSAGE CONTENT INTENT** → **Save Changes**. Do that before the restart. If it is left off, Discord rejects the login (disallowed intent, gateway close 4014) because Mika asks for Message Content. The process never becomes ready, so it cannot post a round or read a guess. A round that somehow ran without message content would always time out, because every guess would arrive blank.
   - The bot also requests these non-privileged intents: Guilds, Guild Messages, Guild Voice States, Guild Emojis and Stickers, Guild Scheduled Events.
   - OAuth2 → URL Generator: scopes `bot` and `applications.commands`. Grant the permissions the moderation and logging features need (ban, kick, manage messages, manage roles, manage server, view audit log, send messages, embed links). Administrator (`permissions=8`) matches the invite link already embedded in `/invite` and `/help`. `/config` needs Manage Server. Mute uses a role, so the bot also needs Manage Roles and that role must sit below the bot's highest role.
   - Rename the application and bot user to **Mika**, and set the bot avatar to the placeholder image above. The application ID does not change.

4. Start the bot:

   ```sh
   npm start
   ```

   `mika.js` loads `.env`, checks that `TOKEN`, `APPLICATIONID`, and `MIKADATABASE` are set, then spawns shards via `src/bot.js`. If a process manager still runs `node rodger.js`, change it to `npm start` or `node mika.js`.

## Slash commands

Commands are global application commands. On every startup the bot registers them with Discord's API v10 (`Routes.applicationCommands`). That PUT replaces the previous global set, so old nested commands disappear on the next boot. No separate deploy script is required.

Discord can take up to an hour to refresh global commands. Re-invite the bot with the `applications.commands` scope if slash commands do not appear.

Every command is server-only. `/help` lists the live set.

| Command | What it does | Who can use it |
| --- | --- | --- |
| `/config` | Ephemeral panel for welcome, command toggles, restricted channels, logging, auto-role, mute role, leveling, and Guess That Anime auto-drop. `/config info` still lists every section. Meme, moderation, and information can be turned off | Manage Server |
| `/help` | Command list | Everyone |
| `/whois`, `/ping`, `/invite`, `/vote`, `/pfp`, `/status`, `/serverstats` | User, bot, and server info. `/serverstats` is the old `/info server` | Everyone |
| `/level`, `/leaderboard` | Rank card (yours, or `target`) and the server leaderboard | Everyone |
| `/ban`, `/unban` | Ban a member, or unban by id | Ban Members |
| `/kick` | Kick a member | Kick Members |
| `/mute`, `/unmute` | Mute role. The bot needs Manage Roles | Kick Members |
| `/warn`, `/unwarn` | Add a warning, or remove one by id or from a menu | Kick Members |
| `/infractions` | Totals, warns, kicks, mutes, and bans | Kick Members |
| `/removeinfraction` | Remove one kick, mute, or ban record | Kick Members |
| `/clearwarns`, `/clearinfractions` | Clear the warning list, or every stored infraction | Kick Members |
| `/clear` | Delete recent messages | Manage Messages |
| `/search` | Look up an anime. An exact title shows the info embed; otherwise pick from a menu. A cached result says so in the footer | Everyone |
| `/recommend` | Recommend an anime to someone in this server. They accept or decline in DMs | Everyone |
| `/randomanime` | Roll a random non-adult anime. Uses your genres and tags unless you pick a genre or tag | Everyone |
| `/setup` | Create your anime profile (discoverable, recommendations) | Everyone |
| `/settings` | Change those two settings, or delete your profile | Everyone |
| `/profile` | View your profile, or another member's in this server. The profile is posted in the channel | Everyone |
| `/findprofile` | Search discoverable profiles by name. Autocomplete lists matches. A public match is posted in the channel | Everyone |
| `/bio`, `/watching`, `/favorite`, `/genres` | Edit your profile. `/bio` opens a box filled with your current bio (200 characters). `/watching` keeps up to 20 shows. `/favorite` keeps a top 5. `/genres` saves up to 10 genres and 10 tags | Everyone |
| `/completed` | List, add, or remove anime you have finished. The profile shows the 5 most recent | Everyone |
| `/meme` | Random anime meme. Tries r/animememes, then r/Animemes. NSFW and spoiler posts are skipped | Everyone |
| `/guess play` | Your own screenshot round. Only you can answer. 30 seconds, 50 crystals. 10 plays per user per rolling hour. Several people can each have a round in one channel | Everyone |
| `/guess leaderboard` | This server's top guessers, ranked by correct guesses | Everyone |
| `/guess stats` | Your wins and crystals in this server | Everyone |

## Anime

Search, the watching list, and profile favorites use [AniList](https://anilist.co) (no API key). Every request asks for non-adult anime. If AniList answers 429 or 5xx, that lookup uses [Kitsu](https://kitsu.app) instead, and NSFW titles are dropped. Jikan is not used. Covers stay on the source CDN; Mika only stores the URL.

Full anime details are cached for 24 hours. Search lists are cached for 15 minutes. Both live on the cache cluster (`MONGO_CACHE_URI`, database `mika-cache`), not on `MIKADATABASE`. A TTL index on `expireAt` deletes each document when it is due, and every read also treats a past `expireAt` as a miss, because Mongo's TTL monitor only runs about once a minute. A unique index on `key` is the lookup. Search keys are a SHA-256 of the normalized text, so a typed query is never a regex or a query operator. A search stores the AniList ids only. Each show in that result is written to the details cache, and a later search hit loads those ids from the details cache. If any id is missing, that search fetches live. There is no in-process copy in front of Mongo, so shards cannot disagree about a hit. A lookup gives up after about 200ms. If `MONGO_CACHE_URI` is unset, or the cache cluster is slow or down, that command asks AniList or Kitsu and still replies. The cache connection does not buffer commands (`bufferCommands: false`, `serverSelectionTimeoutMS` 2000), it connects in the background, and a failure does not touch the main database. A result served from the cache keeps the AniList or Kitsu link and adds "local cache" to the footer. A fresh fetch still says "Via AniList" or "Via Kitsu". Covers stay URLs. No image bytes are stored.

The cache cluster is a 512MB Atlas tier. Mika plans for **440MB**. Measured BSON is about 1.6KB for a typical detail document and about 2.5KB at the 1,200 character synopsis cap, about 300 bytes for a search id list, and about 2.7KB for a guess-pool document with 12 screenshot URLs (about 4.6KB at the 40 URL cap). Planning sizes are rounded up from those: **2KB** per detail, **0.5KB** per search list, **0.5KB** per genre list, **4KB** per guess-pool anime. Caps, enforced by LRU on `lastAccessedAt` (oldest deleted first, indexed, in batches on a 60 second timer and every 25 inserts):

| Collection | What | Cap | Planning size |
| --- | --- | --- | --- |
| `animecaches` | AniList/Kitsu details (`kind: detail`) | 100,000 | ~195MB |
| `animecaches` | Search id lists (`kind: search`) | 40,000 | ~20MB |
| `animecaches` | Genre and tag lists (`kind: genre`) | 8 | negligible |
| `guessanimes` | Guess pool: titles, embed fields, screenshot URLs | 12,000 | ~47MB |

That is about **262MB** of documents inside the 440MB budget, leaving the rest of the budget for indexes and the rest of the 512MB quota for Atlas overhead. Guess rounds can reuse an AniList record that is already in the details cache. Entries in the guess pool older than 30 days are still refreshed on the next use.

`/recommend` DMs the target. If their DMs are closed, nothing is sent and the cooldown is not used. There is one recommendation per sender about every 5 minutes, and about 5 a day to the same person. Names in those messages are plain text, not pings.

If that person's watching list is already full (20), Mika does not send the recommendation. The sender gets a private note that the list is full, and that attempt starts the 5-minute cooldown. The target gets at most one DM per sender per day saying the list is full and how to make room. That DM is skipped when they have already received the day's recommendations. A closed DM is ignored, and the sender still only sees the private note.

`/randomanime` asks AniList for a non-adult anime with a score of at least 70 and popularity of at least 10,000. It picks a random page, then a random show on that page. Leave the options blank to use the genres and tags on your profile, or to roll without those filters when the profile has none. The 🎲 Reroll button works for the person who ran the command, for 2 minutes. If AniList is down, Mika tries Kitsu, then a short error only you can see.

`/meme` is in the Anime section of `/help`. It asks [meme-api.com](https://meme-api.com/gimme/animememes) for 10 posts from r/animememes and posts one https image that is not marked NSFW or spoiler. The title links to the Reddit post. The footer shows the subreddit and the author. Mentions in the title are stripped, and the reply allows no mentions. If that batch has nothing safe, Mika asks once more. If meme-api.com is down, or both batches are unsafe, it uses Reddit's public JSON for r/Animemes. Each request stops after 4 seconds. If both hosts fail, only the person who ran the command sees "Couldn't fetch an anime meme right now." No API key, and the response body is not written to the log.

Profiles are global, keyed by Discord user id. `/profile` posts the profile in the channel when it exists: yours, even if you are not discoverable, and any other member of that server who has one. Discoverable only controls `/findprofile`. Errors and profiles that are not set up stay visible only to the person who asked. `/bio` opens an edit box already filled with the current bio. The box and the server both stop at 200 characters. A blocked word is refused with "That text isn't allowed." and is not saved. Bios and other free text are length-capped, mention-stripped, and checked against an offline slur list.

`/config welcome`, `/config command`, `/config logging`, `/config autorole`, `/config muterole`, `/config leveling`, and `/config guess` take no text options. Each one shows that section's current settings to the person who ran it, plus a menu of what to change. Channel settings ask for a text channel. On/off settings use Enable and Disable. Message settings open a box filled with the current text (`{user}` is a mention, `{userd}` is the display name, and `{level}` is the new level). Typing `default` in the level-up message restores the built-in line. Only that person can use the menu, and Manage Server is checked again on every click and on every text submit. The menu disables itself after 2 minutes. `/config info` is unchanged.

Favorites are an ordered list of up to 5 anime, stored as the AniList id and the title. An older profile that only has the single favorite still shows that show as number 1 until the owner edits the list. Genres and tags are separate, 10 each.

Watching is a list of up to 20 anime. Each new entry stores the AniList id, a cached title, and when it was added. The profile and `/watching list` show the newest first, as plain bullets. Favorites stay numbered. A recommendation keeps 💌 in front of the title. The emoji is not stored in the title. The profile shows the 5 most recent, then `+N more · /watching list` when there are more. An older entry with no added date keeps its place in the saved list, and a later place is treated as newer.

`/watching add` uses the same AniList autocomplete as `/search` and `/favorite`. `/watching remove` completes from that person's own list. `/watching complete` moves a show onto the completed list. `/watching clear` empties the ordered list and leaves an older free-text line alone. `/watching list` shows the whole list, about 10 per page, for you or for someone whose profile you can already open with `/profile`. The buttons work for the person who ran the command, for 2 minutes.

Accepting a recommendation adds that anime and stores `recommended: true` plus the sender id. If that show is already on the list, it is marked instead of added again. If the list is already full when they accept, the recommendation is still accepted, and the confirmation says Watching is full.

Completed is a list of up to 500 anime, stored by AniList id with the cached title, the day it was completed, and whether it came from a recommendation. `/completed list` is paged like watching, and each row has a Discord date. `/completed remove` completes from your own list. `/completed add` records a show you finished before it was on your watching list. Marking the same show again updates the date instead of adding a second row. The profile shows the 5 most recent under ✅ Completed, then `+N more · /completed list`.

An older profile may still have watching stored as free text. That line stays, as a bullet, until the owner removes it with `/watching remove`. It has no AniList id, so it cannot be marked completed. Adding a show, accepting a recommendation, completing a show, and clearing the list do not delete it. The separate accepted-recommendations list is no longer written. Documents that already have one keep those rows. Nothing deletes that field.

`/findprofile` matches a name, bio, show, genre, or tag. The name match is case-insensitive and can be part of the name. Typing in the option lists up to 25 discoverable profiles. Your own profile can appear there for you even when it is not discoverable. Everyone else only sees discoverable profiles. Each result is labeled with the display name, or the username when there is no display name. A favorite, or otherwise the genres, can sit in the short description. Mika stores those names in lowercase (username, global name, and nicknames it has seen, at most 8) and refreshes them when the profile is saved or viewed. An older profile gets a name the next time that happens. Nothing is deleted for this.

Profiles do not use the cache cluster. Dependencies are unchanged, so a machine that already runs Mika does not need another `npm install` and there is nothing to prune. After pulling, set `MONGO_CACHE_URI` if the anime caches should move, then restart the bot. That restart replaces the global command list. Discord can take up to an hour to show the new list. Recommendations only arrive if the target allows DMs from server members. Older guild documents may still contain `SocialCommandStatus` and `ImageCommandStatus`. Mika no longer reads them. `MemeCommandStatus` still turns `/meme` off. Nothing is deleted from the database.

## Guess That Anime

`/guess` is one root command. Discord does not run a parent command that has subcommands, so the round is `/guess play`, the board is `/guess leaderboard`, and your totals are `/guess stats`.

`/guess play` asks AniList for a non-adult anime with the same picker and cache as `/randomanime`, maps it through `idMal`, and posts one screenshot from `https://shikimori.io/api/animes/{malId}/screenshots`. The request sends `User-Agent: Mika-DiscordBot/1.0 (+https://github.com/RenoMG/Mika)`. Shikimori calls share a limiter of 5 per second and 90 per minute. Screenshot lists are cached. If that anime has no MyAnimeList id or no screenshots, Mika tries another, a few times. If Shikimori is down or the request times out, only the person who ran the command sees an error, and no round starts.

A `/guess play` round is personal. Only the person who started it can answer, and other people's messages are ignored for that round. Several people can each have a round in the same channel. One person still has one personal round per channel at a time. Auto-drop rounds stay open to everyone in that channel, the first correct guess wins, and there is still one auto round per channel. Bots are ignored. A single message never counts for both a personal round and an auto round. If you have both open, the guess is checked against your personal round first, and it resolves the auto round only when it does not match your personal round. One message resolves at most one round.

Titles are compared after lowercasing, stripping punctuation and extra spaces, and removing diacritics (NFKD). A small typo still counts. A very short guess has to match exactly, and a short piece of a longer title does not. The winner gets 50 crystals and that round ends. After 30 seconds Mika posts the usual AniList info embed for that round. A personal reveal names the owner in plain text and does not ping anyone.

Crystals and wins are stored per user per server. The leaderboard ranks wins, shows the top 50, and pages by 10, with a crown, silver, and bronze for the top three. `/guess stats` shows your wins and crystals. Manual `/guess play` is limited to 10 starts per user per rolling hour. The limit reply says when the next one opens, with Discord's relative timestamp and the clock time. The round footer adds `2 guesses left this hour` or `1 guess left this hour` only when that many plays remain, and that text is the last part of the footer. With 3 or more left, that text is absent. Auto-drop rounds do not use that limit and do not show it.

`/config guess` picks the auto-drop channel, turns it on or off, and sets the gap from 5 to 60 minutes (the box starts at 10). Only the person who opened the panel can use it, Manage Server is checked on every click, and the panel expires after 2 minutes. While it is on, Mika posts a round in that channel on that interval. The schedule is read again on startup and does not stack timers. A deleted channel or a missing permission skips that drop.

Mika keeps a cache of anime it has already used: AniList id, MyAnimeList id, every title, the info embed fields, the screenshot URLs, and when they were fetched. That pool is `guessanimes` on the cache cluster. Wins, crystals, and the per-server recent list stay on the main database (`GuessPlayer`, `GuessGuild`). Below 200 titles, every round fetches a new anime and saves it. At 200 or more, most rounds reuse the cache and about 12% still fetch a new one. A server will not repeat one of its last 50 anime while another is available, and it walks that anime's screenshots before showing one again. Entries older than 30 days are refreshed on the next use. If that refresh fails, the saved copy is used. If the cache cluster is unset or down, the round fetches live and still posts.

Guesses are normal channel messages, so Message Content has to be enabled. See the setup step above. No API key. The pool uses `MONGO_CACHE_URI` when it is set.

## Updating

On the machine that runs Mika, after this is merged:

1. In the Discord Developer Portal, open Applications → Mika → Bot → Privileged Gateway Intents. Enable **MESSAGE CONTENT INTENT**. Click **Save Changes**. Do this before the restart.
2. `git pull`
3. Do not run `npm install` for this change. No dependency was added or removed.
4. Set `MONGO_CACHE_URI` in `.env` to the cache cluster (Reno's free-tier Atlas). Leave it unset only if anime lookups should stay on live AniList and Kitsu. Do not commit the URI. The main `MIKADATABASE` value does not change.
5. Restart with `npm start` or the existing process manager. The cache connects in the background and starts empty. Old `animecaches` and `guessanimes` collections on the main database are left in place. Drop those later if you want the space back. Do not drop them as part of the restart.

That restart is the command redeploy. The process PUTs the global command list on startup. Discord can take up to an hour to show `/guess`.

If Message Content is still off when the process starts, Discord closes the gateway with a disallowed-intent error and Mika does not come online. No round is posted and no guess can be read. Enable the intent, save, and start Mika again.

## Logging colors

Moderation: warn and mute are yellow, unmute and unban are green, kick and ban are red. System messages are blue. Success is blue. Errors are red. Log deletes and leaves are red, updates are yellow, joins are green.

## Bot accounts and leveling

Bots and app accounts do not gain XP, do not appear on the leaderboard, and `/level` refuses them. That check happens before any level document is created.

Documents already stored for bots are not deleted when the process starts. On the machine that has the database, preview them and then delete them:

```sh
node scripts/remove-bot-levels.js
node scripts/remove-bot-levels.js --apply
```

The script uses `TOKEN` and `MIKADATABASE` from `.env`. It deletes a document only when `client.users.fetch(id)` returns a user with `bot: true`. Users who cannot be fetched, and members who left, are kept. Running it again deletes nothing new. `--dry-run` is the same as running it with no flag.
