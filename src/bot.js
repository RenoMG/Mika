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
    require(`./functions/${file}`)(client);
  }
  client.handleEvents(eventFiles, './src/events');
  client.handleCommands(commandsFolders, './src/commands');
  client.login(process.env.TOKEN);
  client.dbLogin();
})();

process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error', err);
});
