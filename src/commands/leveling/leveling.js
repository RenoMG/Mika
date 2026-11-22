const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const configurationDB = require("../../Models/ConfigurationDB");
const Levels = require('../../levels');

Levels.setURL(`${process.env.MIKADATABASE}`)

module.exports = {
    data: new SlashCommandBuilder()
        .setName('levels')
        .setDescription('Leveling based commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('rank')
                .setDescription("Returns users rank."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription("Returns server leaderboard.")),
    async execute(interaction, client) {
        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;

            const status = (data.LevelingCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (interaction.options.getSubcommand() === "rank") {

                const user = await Levels.fetch(interaction.user.id, interaction.guild.id)
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
        })
    },

};
