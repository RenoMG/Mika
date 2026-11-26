const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/style');
const { memberColor } = require('./lib/color');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('pfp')
        .setDescription('Shows a member\'s profile picture.')
        .addUserOption((option) => option.setName('target').setDescription('The user mentioned.'))),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/pfp target:@user',
    async execute(interaction) {
        const user = interaction.options.getUser('target');
        if (!user) return finishReply(interaction, { content: 'Mention a member to see their avatar.', allowedMentions: allowedMentions() });
        const member = interaction.options.getMember('target');
        if (!member) return finishReply(interaction, { content: 'That user is not in this server.', allowedMentions: allowedMentions() });
        const userEmbed = embed({
            color: memberColor(member),
            title: `${member.displayName}'s avatar`,
            url: member.displayAvatarURL({ size: 1024 }),
            label: 'avatar',
        }).setImage(member.displayAvatarURL({ size: 1024 }));
        await finishReply(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions(user.id) });
    },
};
