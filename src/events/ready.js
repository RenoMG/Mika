const { ActivityType } = require('discord.js');
const { redact } = require('../utils/redact');
const { startGuessScheduler } = require('../guess/scheduler');

module.exports = {
	name: 'clientReady',
	once: true,
	async execute(client) {
		startGuessScheduler(client).catch((error) => {
			console.error('Guess scheduler failed to start.', redact(error));
		});

		const promises = [
			client.shard.fetchClientValues('guilds.cache.size'),
			client.shard.broadcastEval(c => c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)),
		];

		Promise.all(promises)
			.then(results => {
				const totalGuilds = results[0].reduce((acc, guildCount) => acc + guildCount, 0);

				function formatNumber(num) {
					return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
				}
				console.log(`Ready! Logged in as ${client.user.tag}`)

				client.user.setPresence({ activities: [{ name: `${formatNumber(totalGuilds)} servers`, type: ActivityType.Watching}], status: 'dnd' });
			})
	},
};