const { SlashCommandBuilder } = require('discord.js');
const { botRankReply, isBotOrApp } = require('../../utils/botAccount');
const { showRank } = require('../../utils/levelView');
const { redact } = require('../../utils/redact');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('level')
        .setDescription('Shows your rank card, or another member\'s.')
        .addUserOption((option) => option.setName('target').setDescription('Member to look up. Defaults to you.'))),
    category: 'leveling',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/level target:@user',
    async execute(interaction, client) {
        try {
            if (!interaction.guild) return interaction.reply('You are at level 0');
            const target = interaction.options.getUser('target') || interaction.user;
            // Before defer, getGuildConfig, and the level upsert inside Levels.fetch.
            if (isBotOrApp(target)) return interaction.reply(botRankReply());
            return await showRank(interaction, client);
        } catch (error) {
            if (!(interaction.deferred || interaction.replied)) throw error;
            console.error('Level command failed.', redact(error));
            try {
                await interaction.editReply({
                    content: 'There was an error while executing this command!',
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                console.error('Level command failed.', redact(editError));
            }
        }
    },
};
