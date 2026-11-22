const { Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Returns random meme.')),
    category: 'meme',
    configKey: 'MemeCommandStatus',
    checkDisabledChannels: true,
    example: '/meme',
    async execute(interaction) {
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
    },

};
