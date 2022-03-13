const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('image')
        .setDescription('Returns a random image.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('shibe')
                .setDescription("Returns random image of a shibe."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bird')
                .setDescription("Returns random image of a bird."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cat')
                .setDescription("Returns random image of a cat."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dog')
                .setDescription("Returns random image of a dog."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('duck')
                .setDescription("Returns random image of a duck."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fox')
                .setDescription("Returns random image of a fox.")),
    async execute(interaction) {

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ImageCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true})

            } else if (interaction.options.getSubcommand() === "shibe") {

                const url = await fetch("http://shibe.online/api/shibes?count=1&urls=true&httpsUrls=true");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("SHIBE")
                    .setImage(`${res}`)
                    .setFooter({ text: 'Rodger | 🐕 Random Shibe', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "bird") {
                const url = await fetch("http://shibe.online/api/birds?count=1&urls=true&httpsUrls=true");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("BIRD")
                    .setImage(`${res}`)
                    .setFooter({ text: 'Rodger | 🐥 Random Bird', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "cat") {
                const url = await fetch("http://shibe.online/api/cats?count=1&urls=true&httpsUrls=true");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("CAT")
                    .setImage(`${res}`)
                    .setFooter({ text: 'Rodger | 🐈 Random cat', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "dog") {
                const url = await fetch("https://dog.ceo/api/breeds/image/random");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("DOG")
                    .setImage(`${res.message}`)
                    .setFooter({ text: 'Rodger | 🐶 Random Dog', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "duck") {
                const url = await fetch("https://random-d.uk/api/v2/random?format=json");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("DUCK")
                    .setImage(`${res.url}`)
                    .setFooter({ text: 'Rodger | 🦆 Random Duck', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "fox") {
                const url = await fetch("https://randomfox.ca/floof/");
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("FOX")
                    .setImage(`${res.image}`)
                    .setFooter({ text: 'Rodger | 🦊 Random Fox', iconURL: `${process.env.RODGERICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },

};
