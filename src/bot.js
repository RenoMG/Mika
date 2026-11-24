const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { config } = require('dotenv');

config({ path: path.join(__dirname, '..', '.env') });
const { applyBrandEnv, missingRequiredEnv } = require('./brand');
applyBrandEnv();

const missingEnv = missingRequiredEnv();
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values. See README.md.');
  process.exit(1);
}

const client = new Client({
  // Nothing pings unless a send opts in with the intended user ids.
  allowedMentions: { parse: [], repliedUser: false },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    // Guess That Anime reads titles typed in the channel. Enable MESSAGE CONTENT
    // INTENT in the Developer Portal before starting, or Discord rejects the login.
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildScheduledEvents,
  ],
});

client.commands = new Collection();

const functions = fs.readdirSync('./src/functions').filter((file) => file.endsWith('.js'));
const eventFiles = fs.readdirSync('./src/events').filter((file) => file.endsWith('.js'));
const commandsFolders = fs.readdirSync('./src/commands');

(async () => {
  for (const file of functions) {
    const loader = require(`./functions/${file}`);
    // src/functions is only for (client) => void startup loaders. Helpers live in src/utils.
    if (typeof loader !== 'function') {
      console.warn(`Skipping src/functions/${file}: module.exports is not a function(client) loader.`);
      continue;
    }
    loader(client);
  }
  await client.handleEvents(eventFiles, './src/events');
  await client.handleCommands(commandsFolders, './src/commands');
  await client.dbLogin();
  await client.login(process.env.TOKEN);
})().catch((error) => { console.error(require('./utils/redact').redact(error)); process.exit(1); });

process.on('uncaughtException', (err) => {
  const { redact } = require('./utils/redact');
  console.error('There was an uncaught error', redact(err));
  process.exit(1);
});

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  client.stopMutes?.();
  require('./guess/scheduler').stopAll();
  client.destroy();
  await require('./db/cacheConnection').closeCacheConnection();
  await require('mongoose').disconnect();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  shutdown().catch((error) => { console.error(require('./utils/redact').redact(error)); process.exit(1); });
});
process.on('unhandledRejection', (error) => {
  console.error(require('./utils/redact').redact(error));
  process.exit(1);
});
