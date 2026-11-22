require('./mongoose-callbacks');
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
  client.handleEvents(eventFiles, './src/events');
  client.handleCommands(commandsFolders, './src/commands');
  client.login(process.env.TOKEN);
  client.dbLogin();
})();

process.on('uncaughtException', (err) => {
  const { redact } = require('./utils/redact');
  console.error('There was an uncaught error', redact(err));
});
