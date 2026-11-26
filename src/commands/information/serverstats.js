const { ChannelType, SlashCommandBuilder } = require('discord.js');
const { embed, timestamp } = require('../../utils/style');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { formatNumber } = require('./lib/present');

const VERIFICATION = ['None', 'Low', 'Medium', 'High', 'Highest'];

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('Shows info about this server.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/serverstats',
    async execute(interaction) {
        const guild = interaction.guild;
        await defer(interaction);
        const owner = await guild.fetchOwner();
        const count = (type) => guild.channels.cache.filter((channel) => channel.type === type).size;
        const userEmbed = embed({ title: guild.name, label: 'server' })
            .addFields(
                { name: 'Owner', value: `${owner}`, inline: true },
                { name: 'Created', value: `${timestamp(guild.createdAt, 'D')} (${timestamp(guild.createdAt, 'R')})`, inline: true },
                { name: 'ID', value: `\`${guild.id}\``, inline: true },
                { name: 'Members', value: formatNumber(guild.memberCount), inline: true },
                { name: 'Roles', value: formatNumber(guild.roles.cache.size), inline: true },
                { name: 'Emojis', value: formatNumber(guild.emojis.cache.size), inline: true },
                { name: 'Boosts', value: formatNumber(guild.premiumSubscriptionCount || 0), inline: true },
                { name: 'Verification', value: VERIFICATION[guild.verificationLevel] ?? String(guild.verificationLevel), inline: true },
                { name: 'Locale', value: guild.preferredLocale || 'Unknown', inline: true },
                { name: 'Channels', value: `${formatNumber(count(ChannelType.GuildText))} text · ${formatNumber(count(ChannelType.GuildVoice))} voice · ${formatNumber(count(ChannelType.GuildCategory))} categories`, inline: false },
            );
        const icon = guild.iconURL();
        if (icon) userEmbed.setThumbnail(icon);
        await finish(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions(owner && owner.id) });
    },
};
