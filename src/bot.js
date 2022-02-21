const { Client, Intents } = require('discord.js');
const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
const { config } = require("dotenv");

client.on('ready', () => {
    console.log('Rodger is connected to Discord.')
});

(async () => {
    client.login(process.env.TOKEN);
})();