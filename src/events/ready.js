const { ActivityType } = require('discord.js');
const { startGuessScheduler } = require('../guess/scheduler');
const { startMuteScheduler } = require('../utils/mutes');
module.exports = {
    name: 'clientReady', once: true,
    async execute(client) {
        await startGuessScheduler(client);
        client.stopMutes = startMuteScheduler(client);
        const counts = client.shard ? await client.shard.fetchClientValues('guilds.cache.size') : [client.guilds.cache.size];
        const total = counts.reduce((sum, value) => sum + value, 0);
        console.log(`Ready! Logged in as ${client.user.tag}`);
        client.user.setPresence({ activities: [{ name: `${total.toLocaleString()} servers`, type: ActivityType.Watching }], status: 'dnd' });
    },
};
