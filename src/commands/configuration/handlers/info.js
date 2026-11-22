const { ButtonBuilder, ButtonStyle, Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const { getGuildConfig } = require('../../../utils/getGuildConfig');
const PaginationEmbed = require('../../../../modules/pagination.js');
const { embedValue, listValues, statusText } = require('./configFields');

function enabledLabel(list) {
    return statusText(list) === 'true' ? '🟢 Enabled' : '🔴 Disabled';
}

function channelValue(list) {
    const ids = listValues(list, 'Channel');
    if (ids.length < 1) return 'No channel set';
    return `**${ids.map((id) => `<#${id}>`).toString().replace(/,/gi, '')}**`;
}

function roleValue(list) {
    const ids = listValues(list, 'Role');
    if (ids.length < 1) return 'No role set';
    return `**${ids.map((id) => `<@&${id}>`).toString().replace(/,/gi, '')}**`;
}

function messageValue(list, empty) {
    const messages = listValues(list, 'Message');
    if (messages.length < 1) return empty;
    return embedValue(messages.toString().replace(/,/gi, ''));
}

module.exports = async function info(interaction) {
    const data = await getGuildConfig(interaction.guildId);
    if (!data) return interaction.reply('No configuration is stored for this server yet.');

    const disabledIds = listValues(data.DisabledChannels, 'Channels');
    const embed1 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Welcome config')
        .addFields(
            { name: 'Greeting status', value: enabledLabel(data.GreetingStatus), inline: true },
            { name: 'Farewell status', value: enabledLabel(data.FarewellStatus), inline: true },
            { name: 'Greeting channel', value: channelValue(data.GreetingChannel), inline: true },
            { name: 'Farewell channel', value: channelValue(data.FarewellChannel), inline: true },
            { name: 'Greeting message', value: messageValue(data.GreetingMessage, 'Not set'), inline: true },
            { name: 'Farewell message', value: messageValue(data.FarewellMessage, 'Not set'), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed2 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Command status config')
        .addFields(
            { name: 'Moderation status', value: enabledLabel(data.ModerationCommandStatus), inline: true },
            { name: 'Meme status', value: enabledLabel(data.MemeCommandStatus), inline: true },
            { name: 'Social status', value: enabledLabel(data.SocialCommandStatus), inline: true },
            { name: 'Image status', value: enabledLabel(data.ImageCommandStatus), inline: true },
            { name: 'Infromation status', value: enabledLabel(data.InfoCommandStatus), inline: true },
            {
                name: 'Restricted channels',
                value: embedValue(stripIndents`${disabledIds.length >= 1 ? `**${disabledIds.map((id) => `• <#${id}>\n`).toString().replace(/,/gi, '')}**` : 'No channels set'}`),
                inline: true,
            },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed3 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Logging status config')
        .addFields(
            { name: 'Logging status', value: enabledLabel(data.LoggingStatus), inline: true },
            { name: 'Logging channel', value: channelValue(data.LoggingChannel), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed4 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Auto-role status config')
        .addFields(
            { name: 'Auto-role status', value: enabledLabel(data.AutoroleStatus), inline: true },
            { name: 'Auto-role role', value: roleValue(data.AutoroleRole), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed5 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Mute-role status config')
        .addFields({ name: 'Mute-role role', value: roleValue(data.Muterole), inline: true })
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const embed6 = new EmbedBuilder()
        .setTitle('SERVER CONFIGURATION')
        .setColor(Colors.Blue)
        .setDescription('Leveling config')
        .addFields(
            { name: 'Leveling status', value: enabledLabel(data.LevelingCommandStatus), inline: true },
            { name: 'Level up channel', value: channelValue(data.Levelupchannel), inline: true },
            { name: 'Level up message', value: messageValue(data.Levelupmessage, 'No message set'), inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Mika | 🖥️ config', iconURL: `${process.env.MIKAICON}` });

    const button1 = new ButtonBuilder()
        .setCustomId('previousbtn')
        .setLabel('⬅')
        .setStyle(ButtonStyle.Danger);

    const button2 = new ButtonBuilder()
        .setCustomId('nextbtn')
        .setLabel('➡')
        .setStyle(ButtonStyle.Success);

    const pages = [embed1, embed2, embed3, embed4, embed5, embed6];
    const buttonList = [button1, button2];
    return PaginationEmbed(interaction, pages, buttonList);
};
