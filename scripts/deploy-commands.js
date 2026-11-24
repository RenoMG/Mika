require('dotenv').config();
const { REST, Routes, Collection } = require('discord.js');
const fs = require('node:fs');
const { applyBrandEnv } = require('../src/brand');
const { redact } = require('../src/utils/redact');
applyBrandEnv();
async function main() {
    if (!process.env.TOKEN || !process.env.APPLICATIONID) throw new Error('TOKEN and APPLICATIONID are required.');
    const client = { commands: new Collection() };
    require('../src/functions/handleCommands')(client);
    await client.handleCommands(fs.readdirSync('./src/commands'), './src/commands');
    await new REST({ version: '10' }).setToken(process.env.TOKEN)
        .put(Routes.applicationCommands(process.env.APPLICATIONID), { body: client.commandArray });
    console.log(`Registered ${client.commandArray.length} global commands.`);
}
main().catch((error) => { console.error(redact(error)); process.exitCode = 1; });
