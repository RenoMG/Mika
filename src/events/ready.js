const { ActivityType } = require('discord.js');
const { startGuessScheduler } = require('../guess/scheduler');
const { startMuteScheduler } = require('../utils/mutes');
const { startBlogWatcher } = require('../blog/watcher');
const { startNewsWatcher } = require('../news/watcher');
module.exports = {
    name: 'clientReady', once: true,
    async execute(client) {
        await startGuessScheduler(client);
        client.stopMutes = startMuteScheduler(client);
        client.stopGuessPool = require('../guess/select').startPoolWarmup();
        startBlogWatcher(client);
        startNewsWatcher(client);
        console.log(`Ready! Logged in as ${client.user.tag}`);
        // Mika is Reno's World's own bot, so it watches the blog instead of counting servers.
        client.user.setPresence({ activities: [{ name: 'renos.world', type: ActivityType.Watching }], status: 'dnd' });
    },
};
