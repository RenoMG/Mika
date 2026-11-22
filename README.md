# Rodger

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
   | `TOKEN` | yes | Bot token from the Developer Portal |
   | `APPLICATIONID` | yes | Application ID. Used to register slash commands on startup |
   | `RODGERDATABASE` | yes | MongoDB connection string (configuration, infractions, warnings, leveling) |
   | `RODGERICON` | no | Public image URL used as the embed footer icon |

   `RedditCLIENTID`, `RedditCLIENTSECRET`, and `RedditREFRESHTOKEN` are not read by any current command.

3. In the [Discord Developer Portal](https://discord.com/developers/applications):

   - Bot → enable these **privileged intents**:
     - **Server Members Intent** (`GuildMembers`)
     - **Message Content Intent** (`MessageContent`)
   - The bot also requests these non-privileged intents: Guilds, Guild Messages, Guild Voice States, Guild Emojis and Stickers, Guild Scheduled Events.
   - OAuth2 → URL Generator: scopes `bot` and `applications.commands`. Grant the permissions the moderation and logging features need (ban, kick, manage messages, manage roles, view audit log, send messages, embed links). Administrator (`permissions=8`) matches the invite link already embedded in `/info invite` and `/help`.

4. Start the bot:

   ```sh
   npm start
   ```

   `rodger.js` loads `.env`, checks that `TOKEN`, `APPLICATIONID`, and `RODGERDATABASE` are set, then spawns shards via `src/bot.js`.

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
