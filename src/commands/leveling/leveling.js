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
                .setDescription("Returns server leaderboard."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('wallpaper')
                .setDescription("Returns random wallpaper from reddit."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rr")
                .setDescription("Get a random post from the subreddit mentioned")
                .addStringOption(option => option.setName("subreddit").setRequired(true).setDescription("the subreddit name exactly."))),
    async execute(interaction) {
        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;

            const status = (data.RedditCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

            } else if (interaction.options.getSubcommand() === "meme") {


            } else if (interaction.options.getSubcommand() === "art") {


            } else if (interaction.options.getSubcommand() === "wallpaper") {


            } else if (interaction.options.getSubcommand() === "rr") {


            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },

};
