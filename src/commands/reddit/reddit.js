const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fetch = require('node-fetch');
const configurationDB = require("../../Models/ConfigurationDB");

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
                .setName('art')
                .setDescription("Returns random art from reddit."))
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

            } else if (interaction.options.getSubcommand() === "meme") {

                var options = ['https://www.reddit.com/user/scammerrevolts/m/rodger/top/.json?sort=top&t=day&limit=500']

                var response = options[Math.floor(Math.random() * options.length)];

                const { body } = await snekfetch
                    .get(response)
                    .query({ limit: 800 });
                const allowed = body.data.children.filter(post => post.data.preview)
                if (!allowed.length) return message.channel.send('All out of memes... Try again later!');
                const randomnumber = Math.floor(Math.random() * allowed.length)
                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setTitle("MEME | " + allowed[randomnumber].data.title)
                    .setURL(allowed[randomnumber].data.url)
                    .setDescription("Posted by: " + allowed[randomnumber].data.author)
                    .setImage(allowed[randomnumber].data.url)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 😂 Random meme ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, iconURL: `${process.env.RODGERICON}` })

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "art") {
                var options = ['https://www.reddit.com/r/Art.json?sort=top&t=week',
                    'https://www.reddit.com/r/drawing.json?sort=top&t=week',
                    'https://www.reddit.com/r/DigitalPainting.json?sort=top&t=week',
                    'https://www.reddit.com/r/DigitalArt.json?sort=top&t=week',
                    'https://www.reddit.com/r/conceptart.json?sort=top&t=week'
                ]

                var response = options[Math.floor(Math.random() * options.length)];

                const { body } = await snekfetch
                    .get(response)
                    .query({ limit: 800 });
                const allowed = body.data.children.filter(post => !post.data.over_18);
                if (!allowed.length) return message.channel.send('All out of images... Try again later!');
                const randomnumber = Math.floor(Math.random() * allowed.length)
                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setTitle("ART | " + allowed[randomnumber].data.title)
                    .setURL(allowed[randomnumber].data.url)
                    .setDescription("Posted by: " + allowed[randomnumber].data.author)
                    .setImage(allowed[randomnumber].data.url)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 🌄 Random art ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, iconURL: `${process.env.RODGERICON}` })

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "wallpaper") {
                var options = ['https://www.reddit.com/r/wallpaper.json?sort=top&t=week',
                    'https://www.reddit.com/r/wallpapers.json?sort=top&t=week',
                    'https://www.reddit.com/r/iphonewallpapers.json?sort=top&t=week',
                    'https://www.reddit.com/r/MinimalWallpaper.json?sort=top&t=week',
                    'https://www.reddit.com/r/Verticalwallpapers.json?sort=top&t=week']

                var response = options[Math.floor(Math.random() * options.length)];

                const { body } = await snekfetch
                    .get(response)
                    .query({ limit: 800 });
                const allowed = body.data.children.filter(post => !post.data.over_18);
                if (!allowed.length) return message.channel.send('All out of images... Try again later!');
                const randomnumber = Math.floor(Math.random() * allowed.length)
                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setTitle("WALLPAPER | " + allowed[randomnumber].data.title)
                    .setURL(allowed[randomnumber].data.url)
                    .setDescription("Posted by: " + allowed[randomnumber].data.author)
                    .setImage(allowed[randomnumber].data.url)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 🌆 Random wallpaper ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, iconURL: `${process.env.RODGERICON}` })

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "rr") {
                var redditpagefix = interaction.options.getString("subreddit");

                var counts = 21;

                var redditpagefix2 = redditpagefix.slice(0, counts);

                var options = [`https://www.reddit.com/r/${redditpagefix2}.json?sort=top&t=week`]

                var response = options[Math.floor(Math.random() * options.length)];


                const { body } = await snekfetch
                    .get(response)
                    .query({ limit: 800 });
                const allowed = body.data.children.filter(post => !post.data.over_18);
                if (!allowed.length) return message.channel.send('Error! Are you sure you typed the reddit page correctly?');
                const randomnumber = Math.floor(Math.random() * allowed.length)

                var textdata = (allowed[randomnumber].data.selftext || `No text found on this post 😓`);

                var imagedata = (allowed[randomnumber].data.thumbnail || 'https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006');
                var res = imagedata.replace("self", "https://media1.tenor.com/images/d4c3815d77404921e89698fe19bca91c/tenor.gif?itemid=5760006");

                var count = 250;

                var textresult = textdata.slice(0, count) + (textdata.length > count ? "..." : " ");

                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setTitle("RR | " + allowed[randomnumber].data.title)
                    .setURL(`https://www.reddit.com${allowed[randomnumber].data.permalink}`)
                    .setDescription("Posted by: " + allowed[randomnumber].data.author)
                    .addField('‏‏‎ ‎', `Text: \n${textresult}`, false)
                    .addField('‏‏‎ ‎‎‎', `Image:`, false)
                    .setImage(`${res}`)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 🔮 Random Reddit ~ 👍: " + allowed[randomnumber].data.ups + " | 💬: " + allowed[randomnumber].data.num_comments, iconURL: `${process.env.RODGERICON}` })

                await interaction.reply({ embeds: [userEmbed] });

            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },

};
