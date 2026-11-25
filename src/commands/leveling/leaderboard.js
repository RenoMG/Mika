const { finish: finishReply } = require('../../utils/ack');
const { GENERIC_ERROR } = require('../../utils/messages');
const { SlashCommandBuilder } = require('discord.js');
const { replyLeaderboard } = require('../../utils/levelView');
const { redact } = require('../../utils/redact');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the server leaderboard.')),
    category: 'leveling',
    replies: 'public',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/leaderboard',
    async execute(interaction, client) {
        try {
            if (!interaction.guild) return finishReply(interaction, 'You are at level 0');
            return await replyLeaderboard(interaction, client);
        } catch (error) {
            if (!(interaction.deferred || interaction.replied)) throw error;
            console.error('Leaderboard failed.', redact(error));
            try {
                await interaction.editReply({
                    content: GENERIC_ERROR,
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                console.error('Leaderboard failed.', redact(editError));
            }
        }
    },
};
