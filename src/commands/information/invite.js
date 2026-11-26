const { inviteUrl } = require('../../utils/invite');
const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/style');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Shows the link to add Mika to a server.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/invite',
    async execute(interaction) {
        const userEmbed = embed({
            title: 'Invite Mika',
            description: `Add Mika to your server: **[Invite link](${inviteUrl()})**`,
            label: 'invite',
        });
        await finishReply(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions() });
    },
};
