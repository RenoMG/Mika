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
   | `MIKAICON` | no | Public image URL for the embed footer icon. When unset, embeds use `https://renos.world/wp-content/uploads/2025/10/5a4e299d7d70aace-952x1024.jpg` |

   Legacy `RODGERDATABASE` and `RODGERICON` still work when the Mika names are unset. An old Discord CDN avatar URL for this application is replaced with that placeholder.

   `.gitignore` blocks `.env`, private keys, and certificate files (`*.pem`, `*.key`, `*.crt`, `*.cer`, `*.csr`, `*.p12`, `*.pfx`, and similar). Do not force-add them.

3. In the [Discord Developer Portal](https://discord.com/developers/applications):

   - Bot → enable these **privileged intents**:
     - **Server Members Intent** (`GuildMembers`)
     - **Message Content Intent** (`MessageContent`)
   - The bot also requests these non-privileged intents: Guilds, Guild Messages, Guild Voice States, Guild Emojis and Stickers, Guild Scheduled Events.
   - OAuth2 → URL Generator: scopes `bot` and `applications.commands`. Grant the permissions the moderation and logging features need (ban, kick, manage messages, manage roles, view audit log, send messages, embed links). Administrator (`permissions=8`) matches the invite link already embedded in `/info invite` and `/help`.
   - Rename the application and bot user to **Mika**, and set the bot avatar to the placeholder image above. The application ID does not change.

4. Start the bot:

   ```sh
   npm start
   ```

   `mika.js` loads `.env`, checks that `TOKEN`, `APPLICATIONID`, and `MIKADATABASE` are set, then spawns shards via `src/bot.js`. If a process manager still runs `node rodger.js`, change it to `npm start` or `node mika.js`.

## Slash commands

Commands are global application commands. On every startup the bot registers them with Discord's API v10 (`Routes.applicationCommands`). No separate deploy script is required.

Re-registration overwrites the previous global command set. Discord can take up to an hour to refresh global commands. Re-invite the bot with the `applications.commands` scope if slash commands do not appear.

| Command | What it does |
| --- | --- |
| `/config` | Welcome, command toggles, disabled channels, logging, auto-role, mute role, leveling |
| `/help` | Paginated command list |
| `/image` | Random shibe, bird, cat, dog, duck, or fox |
| `/info` | whois, server, ping, invite, vote, pfp, status |
| `/levels` | rank and leaderboard |
| `/meme` | Random meme |
| `/ban`, `/kick`, `/mute`, `/warn`, `/clear`, `/infractions` | Moderation |

## Logging colors

Moderation: warn and mute are yellow, unmute and unban are green, kick and ban are red. System messages are blue. Success is blue. Errors are red. Log deletes and leaves are red, updates are yellow, joins are green.
