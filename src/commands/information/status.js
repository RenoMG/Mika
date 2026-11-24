const { Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
function durationText(ms) {
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 86400)} days, ${Math.floor(seconds / 3600) % 24} hrs, ${Math.floor(seconds / 60) % 60} mins, ${seconds % 60} secs`;
}
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { redact } = require('../../utils/redact');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer, formatNumber } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('status')
        .setDescription('Returns general status information about Mika.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/status',
    async execute(interaction) {
        await defer(interaction);
        try {
            const promises = [
                interaction.client.shard.fetchClientValues('guilds.cache.size'),
                interaction.client.shard.broadcastEval((client) => client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)),
            ];
            const results = await Promise.all(promises);
            const totalGuilds = results[0].reduce((acc, guildCount) => acc + guildCount, 0);
            const totalMembers = results[1].reduce((acc, memberCount) => acc + memberCount, 0);
            const duration = durationText(interaction.client.uptime);
            const userEmbed = new EmbedBuilder()
                .setTitle('STATS')
                .setColor(Colors.Blue)
                .addFields({ name: '**~** Uptime', value: `${duration}`, inline: false })
                .addFields({ name: '**~** Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: false })
                .addFields({ name: '**~** General Stats', value: stripIndents`
				• Servers: ${formatNumber(totalGuilds)}
				• Channels: ${formatNumber(interaction.client.channels.cache.size)}
                • Users: ${formatNumber(totalMembers)}
                • Latency: ${interaction.client.ws.ping}ms
                • Shards: ${interaction.client.shard.count}
                • Shard ID: ${interaction.guild.shard.id}`, inline: false })
                .setFooter(footer('Mika | 💾 Stats'))
                .setTimestamp();
            return finish(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions() });
        } catch (error) {
            console.error('Status failed.', redact(error));
            if (interaction.replied) return null;
            return finish(interaction, {
                content: 'There was an error while executing this command!',
                allowedMentions: allowedMentions(),
            });
        }
    },
};
