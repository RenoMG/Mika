const { SlashCommandBuilder } = require('discord.js');
const { embed, timestamp } = require('../../utils/style');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { redact } = require('../../utils/redact');
const { GENERIC_ERROR } = require('../../utils/messages');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { formatNumber } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('status')
        .setDescription('Returns general status information about Mika.')),
    category: 'information',
    replies: 'public',
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
            const started = Date.now() - interaction.client.uptime;
            const userEmbed = embed({ title: 'Mika status', label: 'status' })
                .addFields(
                    { name: 'Servers', value: formatNumber(totalGuilds), inline: true },
                    { name: 'Users', value: formatNumber(totalMembers), inline: true },
                    { name: 'Channels', value: formatNumber(interaction.client.channels.cache.size), inline: true },
                    { name: 'Online since', value: `${timestamp(started, 'f')} (${timestamp(started, 'R')})`, inline: true },
                    { name: 'Latency', value: `${interaction.client.ws.ping} ms`, inline: true },
                    { name: 'Memory', value: `${formatNumber(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true },
                    { name: 'Shard', value: `${interaction.guild.shard.id + 1} of ${interaction.client.shard.count}`, inline: true },
                );
            return finish(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions() });
        } catch (error) {
            console.error('Status failed.', redact(error));
            if (interaction.replied) return null;
            return finish(interaction, {
                content: GENERIC_ERROR,
                allowedMentions: allowedMentions(),
            });
        }
    },
};
