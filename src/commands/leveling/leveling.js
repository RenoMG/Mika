const { SlashCommandBuilder } = require('discord.js');
const Levels = require('../../levels');
const { applySlashDefaults } = require('../../utils/slashCommand');

Levels.setURL(`${process.env.MIKADATABASE}`)

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Leveling based commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription("Returns users rank."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription("Returns server leaderboard."))),
    category: 'leveling',
    configKey: 'LevelingCommandStatus',
    checkDisabledChannels: true,
    example: '/levels rank',
    async execute(interaction, client) {
        if (interaction.options.getSubcommand() === "rank") {

                const user = await Levels.fetch(interaction.user.id, interaction.guild.id)
                if (!user) return interaction.reply('You are at level 0');
                interaction.reply(`You are at level ${user.level}`)

            } else if (interaction.options.getSubcommand() === "leaderboard") {

                const rawleaderboard = await Levels.fetchLeaderboard(interaction.guild.id, 10);
                if (rawleaderboard.length < 1) return interaction.reply("Leaderboard is not populated yet.");

                const leaderboard = await Levels.computeLeaderboard(client, rawleaderboard);
                const lb = leaderboard.map(e => `**${e.position}**. ${e.username}#${e.discriminator} - Level: ${e.level} - XP: ${e.xp}`)

                interaction.reply(`Leaderboard for **${interaction.guild.name}**\n${lb.join("\n")}`)

            } else {

                await interaction.reply("no subcommand was used.");
            }
    },

};
