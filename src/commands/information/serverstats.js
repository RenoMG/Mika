const { ChannelType, Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer, formatNumber } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('Info about the server.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/serverstats',
    async execute(interaction) {
        const boostcheck = `${interaction.guild.premiumSubscriptionCount}`;
        const boostcount = boostcheck.replace('undefined', '0');
        const imagedata = `${interaction.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png';
        const res = imagedata.replace('null', 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
        const owner = await interaction.guild.fetchOwner();
        const userEmbed = new EmbedBuilder()
            .setTitle('SERVER INFO')
            .setColor(Colors.Blue)
            .setThumbnail(`${res}`)
            .addFields({ name: '**~** General Info', value: stripIndents`
                    • Owner: ${owner}
                    • Name: ${interaction.guild.name}
                    • ID: ${interaction.guild.id}
                    • Pref Locale: ${interaction.guild.preferredLocale}
                    • Creation date: ${interaction.guild.createdAt.toLocaleString()}
                    • Members: ${formatNumber(interaction.guild.memberCount)}
                    • Roles: ${interaction.guild.roles.cache.size}
                    • Verification level: ${['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'][interaction.guild.verificationLevel] ?? interaction.guild.verificationLevel}
                    • Boosts: ${boostcount}
                    • Emojis: ${interaction.guild.emojis.cache.size}`, inline: false })
            .addFields({ name: '**~** Channels:', value: stripIndents`
                    • Categories: ${interaction.guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory).size}
                    • Text: ${interaction.guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).size}
                    • Voice: ${interaction.guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildVoice).size}`, inline: false })
            .setFooter(footer('Mika | 📋 Server info'))
            .setTimestamp();
        await interaction.reply({ embeds: [userEmbed], allowedMentions: allowedMentions(owner && owner.id) });
    },
};
