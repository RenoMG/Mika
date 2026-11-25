const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../../utils/style');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Returns the vote link for Mika.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/vote',
    async execute(interaction) {
        const userEmbed = embed({
            title: 'Vote for Mika',
            description: `Thanks for the support! **[Vote on top.gg](https://top.gg/bot/${process.env.APPLICATIONID}/vote)**`,
            label: 'vote',
        });
        await finishReply(interaction, { embeds: [userEmbed], allowedMentions: allowedMentions() });
    },
};
