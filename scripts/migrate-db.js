require('dotenv').config();
const mongoose = require('mongoose');
const { applyBrandEnv } = require('../src/brand');
const { redact } = require('../src/utils/redact');
applyBrandEnv();
async function main() {
    if (!process.env.MIKADATABASE) throw new Error('MIKADATABASE is required.');
    mongoose.set('autoIndex', false);
    await mongoose.connect(process.env.MIKADATABASE, { dbName: process.env.MIKADATABASENAME || 'mika', serverSelectionTimeoutMS: 10000 });
    const migrations = require('../src/db/migrations');
    try {
        if (process.argv.includes('--apply')) { await migrations.migrate(); console.log('Migration and indexes complete.'); }
        else console.log(JSON.stringify({ problems: await migrations.inspect(), applied: false }, null, 2));
    } finally { await mongoose.disconnect(); }
}
main().catch((error) => { console.error(redact(error)); process.exitCode = 1; });
