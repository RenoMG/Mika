const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fetch = require('node-fetch');
const configurationDB = require("../../Models/ConfigurationDB");
const snoowrap = require('snoowrap');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reddit')
        .setDescription('Reddit based commands.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('meme')
                .setDescription("Returns random meme from reddit."))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rr")
                .setDescription("Get a random post from the subreddit mentioned")
                .addStringOption(option => option.setName("subreddit").setRequired(true).setDescription("the subreddit name exactly."))),
    async execute(interaction) {
        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;

            const r = new snoowrap({
                userAgent: 'Rodger discord bot',
                clientId: `${process.env.RedditCLIENTID}`,
                clientSecret: `${process.env.RedditCLIENTSECRET}`,
                refreshToken: `${process.env.RedditREFRESHTOKEN}`
            });

            const status = (data.RedditCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

            } else if (interaction.options.getSubcommand() === "meme") {

                var options = ['dank_meme',
                    'dankmemes',
                    'meme',
                    'memes']

                var response = options[Math.floor(Math.random() * options.length)];

                const redditmeme = await r.getRandomSubmission(`${response}`)

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("MEME | " + redditmeme.title)
                    .setURL(`https://www.reddit.com${redditmeme.permalink}`)
                    .setDescription("Posted by: " + `[${redditmeme.author.name}](https://www.reddit.com/user/${redditmeme.author.name})`)
                    .setImage(redditmeme.url ? `${redditmeme.url}` : `${redditmeme.url_overridden_by_dest}`)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 😂 Random meme ~ 👍: " + redditmeme.ups + " | 💬: " + redditmeme.num_comments, iconURL: `${process.env.RODGERICON}` })

               await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "rr") {

            var response = interaction.options.getString('subreddit');

            const redditrandom = await r.getRandomSubmission(`${response}`)
            console.log(redditrandom.title)
            const redditrandomname = await r.getSubmission(`${redditrandom.name}`).author.name
            console.log(redditrandomname)

                var textdata = (redditrandom.selftext || `No text found on this post 😓`);

                var imagedata = (redditrandom.url || 'https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006');
                var res = imagedata.replace("self", "https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006");

                var count = 1024;

                var textresult = textdata.slice(0, count) + (textdata.length > count ? "..." : " ");

                if (err) {
                    return interaction.reply(`Are you sure that is the exact subreddit name?`)
                }

                console.log(redditrandom.url)

                const userEmbed = new MessageEmbed()
                    .setColor("BLUE")
                    .setTitle("RR | " + redditrandom.title)
                    .setURL(`https://www.reddit.com${redditrandom.permalink}`)
                    .setDescription("Posted by: " + `[${redditrandom.author.name}](https://www.reddit.com/user/${redditrandom.author.name})`)
                    .addField('‏‏‎ ‎', `Text: \n${textresult}`, false)
                    .addField('‏‏‎ ‎‎‎', `Image:`, false)
                    .setImage(`${res}`)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 🔮 Random Reddit ~ 👍: " + redditrandom.ups + " | 💬: " + redditrandom.num_comments, iconURL: `${process.env.RODGERICON}` })

                await interaction.reply({ embeds: [userEmbed] });

            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },

};
