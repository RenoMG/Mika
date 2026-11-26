const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { latencyMs } = require('../../utils/latency');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Shows how fast Mika is responding.')),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/ping',
    async execute(interaction) {
        const sentAt = Date.now();
        await finishReply(interaction, { content: '🏓 Pinging…', allowedMentions: allowedMentions() });
        const roundTrip = Date.now() - sentAt;
        await interaction.editReply({
            content: `🏓 Pong! Latency: **${latencyMs(interaction.client, roundTrip)} ms**`,
            allowedMentions: allowedMentions(),
        });
    },
};
