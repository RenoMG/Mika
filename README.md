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
