const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const fetch = require('node-fetch');
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Returns random meme.'),
    async execute(interaction) {
        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;

            const status = (data.MemeCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })
            }

                var options = ['https://meme-api.herokuapp.com/gimme/dank_meme',
                    'https://meme-api.herokuapp.com/gimme/dankmemes',
                    'https://meme-api.herokuapp.com/gimme/meme',
                    'https://meme-api.herokuapp.com/gimme/memes',
                    'https://meme-api.herokuapp.com/gimme/me_irl']

                var response = options[Math.floor(Math.random() * options.length)];

                const url = await fetch(`${response}`);
                const res = await url.json();

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("MEME | " + res.title)
                    .setURL(res.postLink)
                    .setDescription("Posted by: " + `[${res.author}](https://www.reddit.com/user/${res.author})`)
                    .setImage(res.url)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 😂 Random meme ~ 👍: " + res.ups, iconURL: `${process.env.RODGERICON}` })

               await interaction.reply({ embeds: [userEmbed] });
        })
    },

};
