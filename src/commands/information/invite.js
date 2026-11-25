const { inviteUrl } = require('../../utils/invite');
const { finish: finishReply } = require('../../utils/ack');
const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/style');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Returns the invite link for Mika.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/invite',
    async execute(interaction) {
        const userEmbed = embed({
            title: 'Invite Mika',
            description: `Add Mika to your server: **[Invite link](${inviteUrl()})**`,
            label: 'invite',
        });
        await finishReply(interaction, { embeds: [userEmbed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    },
};
