const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { embed, timestamp } = require('../../utils/style');
const { memberColor } = require('./lib/color');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('whois')
        .setDescription('Get information for a member.')
        .addUserOption((option) => option.setName('target').setDescription('The user mentioned.'))),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/whois target:@user',
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        if (!user) return finishReply(interaction, { content: 'Mention a member to look up.', allowedMentions: allowedMentions() });
        const member = interaction.options.getMember('target');
        if (!member) return finishReply(interaction, { content: 'That user is not in this server.', allowedMentions: allowedMentions() });
        const roleList = member.roles.cache
            .filter((role) => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .map((role) => `${role}`);
        let roles = '';
        for (const [index, role] of roleList.entries()) {
            const more = ` +${roleList.length - index} more`;
            if (`${roles} ${role}`.length + more.length > 1024) { roles += more; break; }
            roles = roles ? `${roles} ${role}` : role;
        }
        roles = roles || 'None';
        const joined = member.joinedAt ? `${timestamp(member.joinedAt, 'D')} (${timestamp(member.joinedAt, 'R')})` : 'Unknown';
        const created = `${timestamp(user.createdAt, 'D')} (${timestamp(user.createdAt, 'R')})`;
        const userEmbed = embed({
            color: memberColor(member),
            title: member.displayName,
            label: 'user',
        })
            .setThumbnail(member.displayAvatarURL())
            .addFields(
                { name: 'Username', value: user.username, inline: true },
                { name: 'ID', value: `\`${user.id}\``, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Joined server', value: joined, inline: true },
                { name: 'Account created', value: created, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: `Roles (${roleList.length})`, value: roles, inline: false },
            );
        await finishReply(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions(user.id) });
    },
};
