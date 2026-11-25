const { finish: finishReply } = require('../../utils/ack');
const { GENERIC_ERROR } = require('../../utils/messages');
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
    replies: 'public',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/level target:@user',
    async execute(interaction, client) {
        try {
            if (!interaction.guild) return finishReply(interaction, 'You are at level 0');
            const target = interaction.options.getUser('target') || interaction.user;
            // Before defer, getGuildConfig, and the level upsert inside Levels.fetch.
            if (isBotOrApp(target)) return finishReply(interaction, botRankReply());
            return await showRank(interaction, client);
        } catch (error) {
            if (!(interaction.deferred || interaction.replied)) throw error;
            console.error('Level command failed.', redact(error));
            try {
                await interaction.editReply({
                    content: GENERIC_ERROR,
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                console.error('Level command failed.', redact(editError));
            }
        }
    },
};
