const path = require('path');
const mongoose = require('mongoose');
const { config } = require('dotenv');
const { dropLegacyProfiles } = require('../src/db/legacyProfiles');

config({ path: path.join(__dirname, '..', '.env') });

// Dry-run unless --apply is passed. Nothing is dropped on a normal run.
const apply = process.argv.includes('--apply');

async function main() {
    if (!process.env.MIKADATABASE) {
        console.error('MIKADATABASE must be set. See README.md.');
        process.exit(1);
    }
    await mongoose.connect(process.env.MIKADATABASE, { dbName: process.env.MIKADATABASENAME || 'mika' });
    try {
        const result = await dropLegacyProfiles(mongoose.connection.db, { apply });
        if (!result.collections.length) {
            console.log('No old profile collections found. Nothing to do.');
            return;
        }
        for (const row of result.collections) console.log(`${row.name}: ${row.documents} document(s)`);
        console.log(result.dryRun
            ? 'Dry run. Nothing was dropped. Re-run with --apply to drop these collections.'
            : 'Dropped the collections above.');
    } finally {
        await mongoose.disconnect();
    }
}

main().catch((error) => {
    console.error('Cleanup failed.', error && error.message);
    process.exit(1);
});
