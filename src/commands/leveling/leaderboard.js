const { finish: finishReply } = require('../../utils/ack');
const { SlashCommandBuilder } = require('discord.js');
const { replyLeaderboard } = require('../../utils/levelView');
const { redact } = require('../../utils/redact');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the server leaderboard.')),
    category: 'leveling',
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
                    content: 'There was an error while executing this command!',
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                console.error('Leaderboard failed.', redact(editError));
            }
        }
    },
};
