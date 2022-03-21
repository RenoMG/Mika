const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed, MessageActionRow, MessageButton } = require('discord.js');
const { stripIndents } = require("common-tags");
const PaginationEmbed = require(`../../../modules/pagination.js`);
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Rodger help menu.'),
    async execute(interaction, user, channel) {

        const embed1 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Information')
            .addField('**📡 INFO COMMANDS**', `Info commands are executed as: /info **command**`)
            .addField('‏‏‎**COMMANDS**', '**-** ping\n**-** vote\n**-** status\n**-** server\n**-** whois\n**-** pfp\n**-** invite', false)
            .setDescription(`• Rodger server invite link: [Invite](https://discord.gg/7uyR6g2N4K)\n• Rodger invite link: [Invite](https://discord.com/api/oauth2/authorize?client_id=795165717283471370&permissions=8&scope=bot%20applications.commands)`)

        const embed2 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Social')
            .addField('**🎭 SOCIAL COMMANDS**', `Social commands are executed as: /social **command**`)
            .addField('‏‏‎**COMMANDS**', '**-** dab\n**-** stare\n**-** slap\n**-** fbi\n**-** cuddle\n**-** fu\n**-** hack\n**-** 8ball\n**-** rate\n**-** punch\n**-** laugh\n**-** kiss\n**-** kill\n**-** hug\n**-** hf\n**-** cry\n**-** cringe\n**-** blush\n**-** boop\n**-** joke\n**-** fact', false)

        const embed3 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Image')
            .addField('**🖼️ IMAGE COMMANDS**', `Image commands are executed as: /image **command**`)
            .addField('‏‏‎**COMMANDS**', '**-** shibe\n**-** bird\n**-** cat\n**-** dog\n**-** duck\n**-** fox', false)

        const embed4 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Meme')
            .addField('**🤖 REDDIT COMMANDS**', `Meme commands are executed as: /meme **command**`)
            .addField('‏‏‎**COMMANDS**', '**-** meme', false)

        const embed5 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Moderation')
            .addField('**🤖 MODERATION COMMANDS**', `Moderation commands are listed separately.`)
            .addField('‏‏‎**COMMANDS**', '**-** ban\n**-** clear\n**-** infractions\n**-** kick\n**-** mute\n**-** warn', false)

        const embed6 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Configuration')
            .addField('**🤖 MODERATION COMMANDS**', `Configuration commands are executed as: /config **command**`)
            .addField('‏‏‎**COMMANDS**', '**-** welcome\n**-** command\n**-** info\n**-** logging\n**-** autorole\n**-** muterole', false)

        const embed7 = new MessageEmbed()
            .setColor("BLUE")
            .setTitle('Rodger help menu - Leveling')
            .addField('**🤖 MODERATION COMMANDS**', `Leveling is currently still in progress, command are not done yet.`)
            .addField('‏‏‎**COMMANDS**', '', false)

        const button1 = new MessageButton()
            .setCustomId('previousbtn')
            .setLabel('⬅')
            .setStyle('DANGER');

        const button2 = new MessageButton()
            .setCustomId('nextbtn')
            .setLabel('➡')
            .setStyle('SUCCESS');

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

        configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
            if (err) throw err;
            if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })
            } else {
                PaginationEmbed(interaction, pages, buttonList)
            }
        })

    },
};
