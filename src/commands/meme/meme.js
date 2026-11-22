const { Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { getGuildConfig } = require("../../functions/getGuildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Returns random meme.'),
    async execute(interaction) {
        getGuildConfig(interaction.guild.id).then(async (data) => {

            const status = (data.MemeCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })
            }

                var options = ['https://meme-api.com/gimme/dank_meme',
                    'https://meme-api.com/gimme/dankmemes',
                    'https://meme-api.com/gimme/meme',
                    'https://meme-api.com/gimme/memes',
                    'https://meme-api.com/gimme/me_irl']

                var response = options[Math.floor(Math.random() * options.length)];

                const url = await fetch(`${response}`);
                const res = await url.json();

                const userEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle("MEME | " + res.title)
                    .setURL(res.postLink)
                    .setDescription("Posted by: " + `[${res.author}](https://www.reddit.com/user/${res.author})`)
                    .setImage(res.url)
                    .setTimestamp()
                    .setFooter({ text: "Mika | 😂 Random meme ~ 👍: " + res.ups, iconURL: `${process.env.MIKAICON}` })

               await interaction.reply({ embeds: [userEmbed] });
        })
    },

};
