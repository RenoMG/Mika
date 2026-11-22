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

const manager = new ShardingManager('./src/bot.js', { token: process.env.TOKEN });

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
manager.spawn();
