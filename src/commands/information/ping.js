const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Returns latency and API ping.')),
    category: 'information',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/ping',
    async execute(interaction) {
        await finishReply(interaction, { content: 'Checking...', allowedMentions: allowedMentions() });
        await interaction.editReply({
            content: `Latency ${interaction.client.ws.ping}ms`,
            allowedMentions: allowedMentions(),
        });
    },
};
