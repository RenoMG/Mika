const { finish: finishReply } = require('../../utils/ack');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { footer } = require('./lib/present');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Get information for a member.')
        .addUserOption((option) => option.setName('target').setDescription('The user mentioned.'))),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/whois target:@user',
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        if (!user) return finishReply(interaction, { content: 'Please mention a user!', allowedMentions: allowedMentions() });
        const member = interaction.options.getMember('target');
        if (!member) return finishReply(interaction, { content: 'That user is not in this server.', allowedMentions: allowedMentions() });
        const roles = member.roles.cache.filter((role) => role.id !== interaction.guild.id).map((role) => role).join(', ') || 'none';
        const userEmbed = new EmbedBuilder()
            .setTitle('USER INFO')
            .setThumbnail(member.displayAvatarURL())
            .setColor(member.displayHexColor)
            .addFields({ name: '**~** Server information', value: stripIndents`• Display name: ${member.displayName}
                      • Joined: ${member.joinedAt.toLocaleString()}
                      • Roles: ${roles}`, inline: false })
            .addFields({ name: '**~** Account information', value: stripIndents`• ID: ${user.id}
                      • Username: ${user.username}
                      • Discord Tag: ${user.tag}
                      • Created at: ${user.createdAt.toLocaleString()}`, inline: false })
            .setTimestamp()
            .setFooter(footer('Mika | 🔎 User info'));
        await finishReply(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions(user.id) });
    },
};
