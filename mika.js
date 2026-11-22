const { ShardingManager } = require('discord.js');
const { config } = require('dotenv');
const path = require('path');
const { applyBrandEnv, missingRequiredEnv } = require('./src/brand');

config({ path: path.join(__dirname, '.env') });
applyBrandEnv();

const missingEnv = missingRequiredEnv();
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values. See README.md.');
  process.exit(1);
}

const manager = new ShardingManager('./src/bot.js', {
  token: process.env.TOKEN,
  // One shard until Discord would recommend more. 'auto' asks the gateway for a
  // count first, so a rejected token never reaches the loaders or command registration.
  totalShards: 1,
});

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
manager.spawn();
