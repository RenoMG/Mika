const {
  getMember,
  formatDate
} = require("../../functions.js");
const {
  MessageEmbed, IntegrationApplication
} = require("discord.js");
const {
  stripIndents
} = require("common-tags");
const moment = require("moment");
require("moment-duration-format");
const Keyv = require('keyv');

const commandcount = new Keyv(`${process.env.BOTRELATEDKEYV}`, { namespace: 'setcommandcount' });


module.exports = {
  name: "stats",
  aliases: ["s", "rodgerstats", "status", "statistics"],
  category: "info",
  description: "Gives stats on bot.",
  run: async (client, message, args, user) => {

    const count = `${await commandcount.get('msgcount')}`;

    const promises = [
      client.shard.fetchClientValues('guilds.cache.size'),
      client.shard.broadcastEval('this.guilds.cache.reduce((prev, guild) => prev + guild.memberCount, 0)'),
    ];

    Promise.all(promises)
      .then(results => {
        const totalGuilds = results[0].reduce((prev, guildCount) => prev + guildCount, 0);
        const totalMembers = results[1].reduce((prev, memberCount) => prev + memberCount, 0);

        function formatNumber(num) {
          return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
        }

        let uptime = ``;
        let {
          version
        } = require("discord.js");
        let statsmoment = require("moment");
        let duration = statsmoment.duration(client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");

        uptime += `${duration}`;

        const embed = new MessageEmbed()
          .setTitle("STATS")
          .setColor("RANDOM")
          .addField('**~** Uptime', `${uptime}`, false)
          .addField('**~** Memory Usage', `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, false)
          .addField('**~** General Stats',
            stripIndents`
				• Servers: ${formatNumber(totalGuilds)}
				• Channels: ${formatNumber(client.channels.cache.size)}
        • Users: ${formatNumber(totalMembers)}
        • Latency: ${Date.now() - message.createdTimestamp}ms
        • Shards: ${client.shard.count}
        • Shard ID: ${message.guild.shardID}
        • Commands used: ${formatNumber(count)}
			`,
            false)

          .setFooter("Rodger | 💾 Stats", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
          .setTimestamp()

        message.channel.send(embed);

      })
      .catch(console.error);

  }
}
