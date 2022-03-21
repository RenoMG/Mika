const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fetch = require('node-fetch');
const configurationDB = require("../../Models/ConfigurationDB");
const Levels = require('discord-xp');

Levels.setURL(`${process.env.RODGERDATABASE}`)

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
    async execute(interaction) {
        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;

            const status = (data.LevelingCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

            } else if (interaction.options.getSubcommand() === "rank") {


            } else if (interaction.options.getSubcommand() === "leaderboard") {

            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },

};
