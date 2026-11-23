# Mika

Multi-purpose Discord bot (moderation, logging, configuration, leveling, images, and social commands).

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
   | `MIKAICON` | no | Public image URL for the embed footer icon. When unset, embeds use `https://renos.world/wp-content/uploads/2025/10/5a4e299d7d70aace-952x1024.jpg` |

   Legacy `RODGERDATABASE` and `RODGERICON` still work when the Mika names are unset. An old Discord CDN avatar URL for this application is replaced with that placeholder.

   Mika connects with `dbName: process.env.MIKADATABASENAME || 'mika'`. Older runs that omitted a database name stored `configurationdbs`, `infractionsdbs`, `levels`, and `warndbs` in MongoDB's default database, `test`. Those documents are not moved. Leave `MIKADATABASENAME` unset to use `mika` (copy the old collections across yourself if you need them), or set `MIKADATABASENAME=test` to keep reading `test`. Restart the bot after changing it.

   `.gitignore` blocks `.env`, private keys, and certificate files (`*.pem`, `*.key`, `*.crt`, `*.cer`, `*.csr`, `*.p12`, `*.pfx`, and similar). Do not force-add them.

3. In the [Discord Developer Portal](https://discord.com/developers/applications):

   - Bot → enable these **privileged intents**:
     - **Server Members Intent** (`GuildMembers`)
     - **Message Content Intent** (`MessageContent`)
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
| `/config` | Welcome, command toggles, disabled channels, logging, auto-role, mute role, leveling | Manage Server |
| `/help` | Command list | Everyone |
| `/image` | Random shibe, bird, cat, dog, duck, or fox | Everyone |
| `/whois`, `/ping`, `/invite`, `/vote`, `/pfp`, `/status`, `/serverstats` | User, bot, and server info. `/serverstats` is the old `/info server` | Everyone |
| `/level`, `/leaderboard` | Rank card (yours, or `target`) and the server leaderboard | Everyone |
| `/meme` | Random meme | Everyone |
| `/ban`, `/unban` | Ban a member, or unban by id | Ban Members |
| `/kick` | Kick a member | Kick Members |
| `/mute`, `/unmute` | Mute role. The bot needs Manage Roles | Kick Members |
| `/warn`, `/unwarn` | Add a warning, or remove one by id or from a menu | Kick Members |
| `/infractions` | Totals, warns, kicks, mutes, and bans | Kick Members |
| `/removeinfraction` | Remove one kick, mute, or ban record | Kick Members |
| `/clearwarns`, `/clearinfractions` | Clear the warning list, or every stored infraction | Kick Members |
| `/clear` | Delete recent messages | Manage Messages |
| `/stare`, `/slap`, `/hug`, and the other social commands | One root command per action | Everyone |
| `/search` | Look up an anime. An exact title shows the info embed; otherwise pick from a menu. A cached result says so in the footer | Everyone |
| `/recommend` | Recommend an anime to someone in this server. They accept or decline in DMs | Everyone |
| `/randomanime` | Roll a random non-adult anime. Uses your genres and tags unless you pick a genre or tag | Everyone |
| `/setup` | Create your anime profile (discoverable, recommendations) | Everyone |
| `/settings` | Change those two settings, or delete your profile | Everyone |
| `/profile` | View your profile, or another member's in this server. The profile is posted in the channel | Everyone |
| `/findprofile` | Search discoverable profiles from any server. A match is posted in the channel | Everyone |
| `/bio`, `/watching`, `/favorite`, `/genres` | Edit your profile. `/favorite` keeps a top 5. `/genres` saves up to 10 genres and 10 tags | Everyone |

## Anime

Search and profile favorites use [AniList](https://anilist.co) (no API key). Every request asks for non-adult anime. If AniList answers 429 or 5xx, that lookup uses [Kitsu](https://kitsu.app) instead, and NSFW titles are dropped. Jikan is not used. Covers stay on the source CDN; Mika only stores the URL.

Full anime details are cached in memory for 24 hours (at most 200 titles). Search lists are cached for 15 minutes (at most 40). A result served from that cache keeps the AniList or Kitsu link and adds "local cache" to the footer. A fresh fetch still says "Via AniList" or "Via Kitsu". Nothing new is required in `.env`.

`/recommend` DMs the target. If their DMs are closed, nothing is sent and the cooldown is not used. There is one recommendation per sender about every 5 minutes, and about 5 a day to the same person. Names in those messages are plain text, not pings.

`/randomanime` asks AniList for a non-adult anime with a score of at least 70 and popularity of at least 10,000. It picks a random page, then a random show on that page. Leave the options blank to use the genres and tags on your profile, or to roll without those filters when the profile has none. The 🎲 Reroll button works for the person who ran the command, for 2 minutes. If AniList is down, Mika tries Kitsu, then a short error only you can see.

Profiles are global, keyed by Discord user id. `/profile` posts the profile in the channel when it exists: yours, even if you are not discoverable, and any other member of that server who has one. Discoverable only controls `/findprofile`. Errors and profiles that are not set up stay visible only to the person who asked. Bios and other free text are length-capped, mention-stripped, and checked against an offline slur list.

Favorites are an ordered list of up to 5 anime, stored as the AniList id and the title. An older profile that only has the single favorite still shows that show as number 1 until the owner edits the list. Genres and tags are separate, 10 each.

No new environment variable. Dependencies are unchanged, so a machine that already runs Mika does not need another `npm install` for this feature. After pulling, restart the bot. Discord can take up to an hour to replace the global command list. Recommendations only arrive if the target allows DMs from server members.

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
