const { ButtonBuilder, ButtonStyle, Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const PaginationEmbed = require(`../../../modules/pagination.js`);
const { getGuildConfig } = require("../../utils/getGuildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mika help menu.'),
    async execute(interaction, user, channel) {

        const embed1 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Information')
            .addFields({ name: '**📡 INFO COMMANDS**', value: `Info commands are executed as: /info **command**` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** ping\n**-** vote\n**-** status\n**-** server\n**-** whois\n**-** pfp\n**-** invite', inline: false })
            .setDescription(`• Mika server invite link: [Invite](https://discord.gg/7uyR6g2N4K)\n• Mika invite link: [Invite](https://discord.com/api/oauth2/authorize?client_id=795165717283471370&permissions=8&scope=bot%20applications.commands)`)

        const embed2 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Social')
            .addFields({ name: '**🎭 SOCIAL COMMANDS**', value: `Social commands are executed as: /social **command**` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** dab\n**-** stare\n**-** slap\n**-** fbi\n**-** cuddle\n**-** fu\n**-** hack\n**-** 8ball\n**-** rate\n**-** punch\n**-** laugh\n**-** kiss\n**-** kill\n**-** hug\n**-** hf\n**-** cry\n**-** cringe\n**-** blush\n**-** boop\n**-** joke\n**-** fact', inline: false })

        const embed3 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Image')
            .addFields({ name: '**🖼️ IMAGE COMMANDS**', value: `Image commands are executed as: /image **command**` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** shibe\n**-** bird\n**-** cat\n**-** dog\n**-** duck\n**-** fox', inline: false })

        const embed4 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Meme')
            .addFields({ name: '**🤖 REDDIT COMMANDS**', value: `Meme commands are executed as: /meme **command**` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** meme', inline: false })

        const embed5 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Moderation')
            .addFields({ name: '**🤖 MODERATION COMMANDS**', value: `Moderation commands are listed separately.` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** ban\n**-** clear\n**-** infractions\n**-** kick\n**-** mute\n**-** warn', inline: false })

        const embed6 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Configuration')
            .addFields({ name: '**🤖 MODERATION COMMANDS**', value: `Configuration commands are executed as: /config **command**` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: '**-** welcome\n**-** command\n**-** info\n**-** logging\n**-** autorole\n**-** muterole', inline: false })

        const embed7 = new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle('Mika help menu - Leveling')
            .addFields({ name: '**🤖 MODERATION COMMANDS**', value: `Leveling is currently still in progress, command are not done yet.` })
            .addFields({ name: '‏‏‎**COMMANDS**', value: 'Not done.', inline: false })

        const button1 = new ButtonBuilder()
            .setCustomId('previousbtn')
            .setLabel('⬅')
            .setStyle(ButtonStyle.Danger);

        const button2 = new ButtonBuilder()
            .setCustomId('nextbtn')
            .setLabel('➡')
            .setStyle(ButtonStyle.Success);

        // Create an array of embeds
        pages = [
            embed1,
            embed2,
            embed3,
            embed4,
            embed5,
            embed6
        ];

        //create an array of buttons

        buttonList = [
            button1,
            button2
        ]

        return getGuildConfig(interaction.guildId).then(async (data) => {
            if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })
            } else {
                PaginationEmbed(interaction, pages, buttonList)
            }
        })

    },
};
