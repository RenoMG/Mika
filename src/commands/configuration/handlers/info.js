const { ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const { getGuildConfig } = require('../../../utils/getGuildConfig');
const PaginationEmbed = require('../../../../modules/pagination.js');

module.exports = async function info(interaction) {
    // The info subcommand has no status option. This stays null, so the leveling
    // line shows disabled, which is what /config info did before the split.
    const levelstatus = interaction.options.getString("status");

return getGuildConfig(interaction.guildId).then(async (data) => {
    if (data) {

        const greetingstatuscheck = (data.GreetingStatus.map((w) => w.Status));
        const farewellstatuscheck = (data.FarewellStatus.map((w) => w.Status));
        const filtergreetingchannel = (data.GreetingChannel.map((w) => w.Channel).filter(n => n));
        const filterfarewellchannel = (data.FarewellChannel.map((w) => w.Channel).filter(n => n));
        const embed1 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Welcome config")
            .addFields({ name: 'Greeting status', value: `${`${greetingstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Farewell status', value: `${`${farewellstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Greeting channel', value: `${`${(filtergreetingchannel).length >= 1}` === "true" ? `**${(filtergreetingchannel.map(i => '<#' + i + '>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true },
                { name: 'Farewell channel', value: `${`${(filterfarewellchannel).length >= 1}` === "true" ? `**${(filterfarewellchannel.map(i => '<#' + i + '>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true },
                { name: 'Greeting message', value: `${data.GreetingMessage.map((w) => w.Message)}`, inline: true },
                { name: 'Farewell message', value: `${data.FarewellMessage.map((w) => w.Message)}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

        const moderationstatuscheck = (data.ModerationCommandStatus.map((w) => w.Status));
        const memestatuscheck = (data.MemeCommandStatus.map((w) => w.Status));
        const socialstatuscheck = (data.SocialCommandStatus.map((w) => w.Status));
        const imagestatuscheck = (data.ImageCommandStatus.map((w) => w.Status));
        const infostatuscheck = (data.InfoCommandStatus.map((w) => w.Status));
        const disabledchannelfix = (data.DisabledChannels.map((w) => w.Channels));
        const filterdisabledchannels = (data.DisabledChannels.map((w) => w.Channels).filter(n => n));
        const embed2 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Command status config")
            .addFields({ name: 'Moderation status', value: `${`${moderationstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Meme status', value: `${`${memestatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Social status', value: `${`${socialstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Image status', value: `${`${imagestatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Infromation status', value: `${`${infostatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Restricted channels', value: stripIndents`${`${(filterdisabledchannels).length >= 1}` === "true" ? `**${(filterdisabledchannels.map(i => '• <#' + i + '>\n')).toString().replace(/,/gi, "")}**` : "No channels set"}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

        const loggingstatuscheck = (data.LoggingStatus.map((w) => w.Status));
        const filterloggingchannel = (data.LoggingChannel.map((w) => w.Channel).filter(n => n));
        const embed3 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Logging status config")
            .addFields({ name: 'Logging status', value: `${`${loggingstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Logging channel', value: `${`${(filterloggingchannel).length >= 1}` === "true" ? `**${(filterloggingchannel.map(i => '<#' + i + '>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

        const autorolestatscheck = (data.AutoroleStatus.map((w) => w.Status));
        const filterautorole = (data.AutoroleRole.map((w) => w.Role).filter(n => n));
        const embed4 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Auto-role status config")
            .addFields({ name: 'Auto-role status', value: `${`${autorolestatscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                { name: 'Auto-role role', value: `${`${(filterautorole).length >= 1}` === "true" ? `**${(filterautorole.map(i => '<@&' + i + '>')).toString().replace(/,/gi, "")}**` : "No role set"}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

        const filtermuterole = (data.Muterole.map((w) => w.Role).filter(n => n));
        const embed5 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Mute-role status config")
            .addFields({ name: 'Mute-role role', value: `${`${(filtermuterole).length >= 1}` === "true" ? `**${(filtermuterole.map(i => '<@&' + i + '>')).toString().replace(/,/gi, "")}**` : "No role set"}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

        const filterLevelupchannel = (data.Levelupchannel.map((w) => w.Channel).filter(n => n));
        const filterLevelupmessage = (data.Levelupmessage.map((w) => w.Message).filter(n => n));
        const embed6 = new EmbedBuilder()
            .setTitle(`SERVER CONFIGURATION`)
            .setColor(Colors.Blue)
            .setDescription("Mute-role status config")
            .addFields({ name: 'Leveling status', value: `${`${levelstatus}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
            { name: 'Level up channel', value: `${`${(filterLevelupchannel).length >= 1}` === "true" ? `**${(filterLevelupchannel.map(i => '<#' + i + '>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true },
            { name: 'Level up message', value: `${`${(filterLevelupmessage).length >= 1}` === "true" ? `${(filterLevelupmessage.map(i => '' + i + '')).toString().replace(/,/gi, "")}` : "No message set"}`, inline: true })
            .setTimestamp()
            .setFooter({ text: "Mika | 🖥️ config", iconURL: `${process.env.MIKAICON}` })

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

        PaginationEmbed(interaction, pages, buttonList)

    }
})
};
