const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const { config } = require('dotenv');
const { removeBotLevelDocs } = require('../src/utils/removeBotLevels');

config({ path: path.join(__dirname, '..', '.env') });

// Dry-run unless --apply is passed. Nothing is deleted on a normal run.
const apply = process.argv.includes('--apply');
const dryRunFlag = process.argv.includes('--dry-run');

function report(result) {
    if (result.dryRun) {
        console.log(`Dry run: ${result.documents} level document(s) for ${result.bots} bot account(s), out of ${result.checked} user id(s). Nothing was deleted.`);
        if (result.ids.length) console.log(`Bot user ids: ${result.ids.join(', ')}`);
        console.log('Re-run with --apply to delete those documents.');
        return;
    }
    console.log(`Deleted ${result.deleted} level document(s) for ${result.bots} bot account(s). ${result.checked} user id(s) checked.`);
}

async function main() {
    if (apply && dryRunFlag) {
        console.error('Use either --apply or --dry-run, not both.');
        process.exit(1);
    }
    if (!process.env.TOKEN || !process.env.MIKADATABASE) {
        console.error('TOKEN and MIKADATABASE must be set. See README.md.');
        process.exit(1);
    }

    await mongoose.connect(process.env.MIKADATABASE, { dbName: process.env.MIKADATABASENAME || 'mika' });
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
        await client.login(process.env.TOKEN);
        const result = await removeBotLevelDocs(client, { dryRun: !apply });
        report(result);
    } finally {
        client.destroy();
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error('Bot level cleanup failed.', error);
    process.exit(1);
});
