const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Returns latency and API ping.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/ping',
    async execute(interaction) {
        await finishReply(interaction, { content: '🏓 Pinging…', allowedMentions: allowedMentions() });
        await interaction.editReply({
            content: `🏓 Pong! Latency: **${interaction.client.ws.ping} ms**`,
            allowedMentions: allowedMentions(),
        });
    },
};
