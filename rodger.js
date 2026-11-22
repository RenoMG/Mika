const { ShardingManager } = require('discord.js');
const { config } = require('dotenv');
const path = require('path');

config({ path: path.join(__dirname, '.env') });

const requiredEnv = ['TOKEN', 'APPLICATIONID', 'RODGERDATABASE'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values. See README.md.');
  process.exit(1);
}

const manager = new ShardingManager('./src/bot.js', { token: process.env.TOKEN });

manager.on('shardCreate', (shard) => console.log(`Launched shard ${shard.id}`));
manager.spawn();
