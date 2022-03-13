const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, MessageButton } = require('discord.js');
const { stripIndents } = require("common-tags");
const configurationDB = require("../../Models/ConfigurationDB");
const PaginationEmbed = require(`../../../modules/pagination.js`);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Server configuration management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('Greeting and Farewell config')
                .addChannelOption(option => option.setName("gchannel").addChannelTypes([0]).setDescription("Set the channel for greeting messages."))
                .addChannelOption(option => option.setName("fchannel").addChannelTypes([0]).setDescription("Set the channel for farewell messages."))
                .addStringOption(option => option.setName("greeting").setDescription("Enable or Disable greeting").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("farewell").setDescription("Enable or Disable farewell").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("gmessage").setDescription("Set the greeting message."))
                .addStringOption(option => option.setName("fmessage").setDescription("Set the farewell message.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('command')
                .setDescription('Command status config')
                .addStringOption(option => option.setName("moderation").setDescription("Enable or disable moderation commands.").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("reddit").setDescription("Enable or disable reddit commands.").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("information").setDescription("Enable or disable information commands.").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("social").setDescription("Enable or disable social commands.").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("image").setDescription("Enable or disable image commands.").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addChannelOption(option => option.setName("achannel").addChannelTypes([0]).setDescription("Add channel to restric commands in."))
                .addChannelOption(option => option.setName("rchannel").addChannelTypes([0]).setDescription("Remove channel from having command restricted.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Shows all current server settings.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logging')
                .setDescription('Logging config')
                .addStringOption(option => option.setName("status").setDescription("Enable or disable logging").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addChannelOption(option => option.setName("channel").addChannelTypes([0]).setDescription("Set channel for logs to be sent to."))),
    permissions: [Permissions.FLAGS.BAN_MEMBERS],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["welcome", "command", "info", "logging"])
        const gChannel = interaction.options.getChannel("gchannel");
        const fChannel = interaction.options.getChannel("fchannel");
        const greetingO = interaction.options.getString("greeting");
        const farewellO = interaction.options.getString("farewell");
        const gMessage = interaction.options.getString("gmessage");
        const fMessage = interaction.options.getString("fmessage");
        const moderation = interaction.options.getString("moderation");
        const reddit = interaction.options.getString("reddit");
        const information = interaction.options.getString("information");
        const social = interaction.options.getString("social");
        const image = interaction.options.getString("image");
        const rchannel = interaction.options.getChannel("rchannel");
        const achannel = interaction.options.getChannel("achannel");
        const logstatus = interaction.options.getString("status");
        const logchannel = interaction.options.getChannel("channel");

        configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
            if (err) throw err;
            if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })
            }

            if (Sub === 'welcome') {

                if (gChannel === null && fChannel === null && greetingO === null && farewellO === null && gMessage === null && fMessage === null) {
                    return interaction.reply(`Nothing was changed!`);
                } else {
                    configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                        if (err) throw err;
                        if (!data) {
                            stripChannel1 = gChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                            stripChannel2 = fChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                            data = new configurationDB({
                                GuildID: interaction.guildId,
                                GreetingChannel: [
                                    {
                                        Channel: stripChannel1
                                    }
                                ],
                                FarewellChannel: [
                                    {
                                        Channel: stripChannel2
                                    }
                                ],
                                GreetingMessage: [
                                    {
                                        Message: gMessage
                                    }
                                ],
                                FarewellMessage: [
                                    {
                                        Message: fMessage
                                    }
                                ],
                                GreetingStatus: [
                                    {
                                        Status: greetingO
                                    }
                                ],
                                FarewellStatus: [
                                    {
                                        Status: farewellO
                                    }
                                ],
                            })
                        } else {
                            if (gChannel === null) {

                            } else {
                                stripChannel1 = gChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                                data.GreetingChannel.splice(0, 1)
                                const obj = {
                                    Channel: stripChannel1
                                }
                                data.GreetingChannel.push(obj)
                            }

                            if (fChannel === null) {

                            } else {
                                stripChannel2 = fChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                                data.FarewellChannel.splice(0, 1)
                                const obj = {
                                    Channel: stripChannel2
                                }
                                data.FarewellChannel.push(obj)
                            }

                            if (greetingO === null) {

                            } else {
                                data.GreetingStatus.splice(0, 1)
                                const obj = {
                                    Status: greetingO
                                }
                                data.GreetingStatus.push(obj)
                            }

                            if (farewellO === null) {

                            } else {
                                data.FarewellStatus.splice(0, 1)
                                const obj = {
                                    Status: farewellO
                                }
                                data.FarewellStatus.push(obj)
                            }

                            if (gMessage === null) {

                            } else {
                                data.GreetingMessage.splice(0, 1)
                                const obj = {
                                    Message: gMessage
                                }
                                data.GreetingMessage.push(obj)
                            }

                            if (fMessage === null) {

                            } else {
                                data.FarewellMessage.splice(0, 1)
                                const obj = {
                                    Message: fMessage
                                }
                                data.FarewellMessage.push(obj)
                            }
                        }
                        data.save()
                        interaction.reply(`Server config has been updated!`)
                    });
                }

            } else if (Sub === 'command') {

                if (moderation === null && reddit === null && information === null && social === null && image === null && rchannel === null && achannel === null) {
                    return interaction.reply(`Nothing was changed!`);
                } else {
                    configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                        if (err) throw err;
                        if (!data) {
                            data = new configurationDB({
                                GuildID: interaction.guildId,
                                ImageCommandStatus: [
                                    {
                                        Status: image
                                    }
                                ],
                                ModerationCommandStatus: [
                                    {
                                        Status: moderation
                                    }
                                ],
                                RedditCommandStatus: [
                                    {
                                        Status: reddit
                                    }
                                ],
                                SocialCommandStatus: [
                                    {
                                        Status: social
                                    }
                                ],
                                InfoCommandStatus: [
                                    {
                                        Status: information
                                    }
                                ],
                                DisabledChannels: [
                                    {
                                        Channels: achannel.id
                                    }
                                ]
                            })
                        } else {
                            if (image === null) {

                            } else {
                                data.ImageCommandStatus.splice(0, 1)
                                const obj = {
                                    Status: image
                                }
                                data.ImageCommandStatus.push(obj)
                            }

                            if (moderation === null) {

                            } else {
                                data.ModerationCommandStatus.splice(0, 1)
                                const obj = {
                                    Status: moderation
                                }
                                data.ModerationCommandStatus.push(obj)
                            }

                            if (reddit === null) {

                            } else {
                                data.RedditCommandStatus.splice(0, 1)
                                const obj = {
                                    Status: reddit
                                }
                                data.RedditCommandStatus.push(obj)
                            }

                            if (social === null) {

                            } else {
                                data.SocialCommandStatus.splice(0, 1)
                                const obj = {
                                    Status: social
                                }
                                data.SocialCommandStatus.push(obj)
                            }

                            if (information === null) {

                            } else {
                                data.InfoCommandStatus.splice(0, 1)
                                const obj = {
                                    Status: information
                                }
                                data.InfoCommandStatus.push(obj)
                            }

                            if (achannel === null) {

                            } else {
                                const obj = {
                                    Channels: achannel.id
                                }
                                data.DisabledChannels.push(obj)
                            }

                            if (rchannel === null) {

                            } else {

                                data.DisabledChannels.pull({ Channels: rchannel.id })

                            }
                        }
                        data.save()
                        interaction.reply(`Server config has been updated!`)
                    });

                }

            } else if (Sub === "info") {
                configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                    if (err) throw err;
                    if (data) {
                        const embed1 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("GREEN")
                            .setDescription("Welcome config")
                            .addFields({ name: 'Greeting status', value: `Is enabeled? **${data.ModerationCommandStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Farewell status', value: `Is enabeled? **${data.FarewellStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Greeting channel', value: `**<#${data.GreetingChannel.map((w) => w.Channel)}>**`, inline: true },
                                { name: 'Farewell channel', value: `**<#${data.FarewellChannel.map((w) => w.Channel)}>**`, inline: true },
                                { name: 'Greeting message', value: `**${data.GreetingMessage.map((w) => w.Message)}**`, inline: true },
                                { name: 'Farewell message', value: `**${data.FarewellMessage.map((w) => w.Message)}**`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

                        const embed2 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("GREEN")
                            .setDescription("Command status config")
                            .addFields({ name: 'Moderation status', value: `Is enabeled? **${data.GreetingStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Reddit status', value: `Is enabeled? **${data.RedditCommandStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Social status', value: `Is enabeled? **${data.SocialCommandStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Image status', value: `Is enabeled? **${data.ImageCommandStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Infromation status', value: `Is enabeled? **${data.InfoCommandStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Restricted channels', value: stripIndents`**${data.DisabledChannels.map((w) => '• <#' + w.Channels + '> \n').toString().replace(/,/gi, "")}**`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

                        const embed3 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("GREEN")
                            .setDescription("Logging status config")
                            .addFields({ name: 'Logging status', value: `Is enabeled? **${data.LoggingStatus.map((w) => w.Status)}**`, inline: true },
                                { name: 'Logging channel', value: `**<#${data.LoggingChannel.map((w) => w.Channel)}>**`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

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
                            embed3
                        ];

                        //create an array of buttons

                        buttonList = [
                            button1,
                            button2
                        ]

                        PaginationEmbed(interaction, pages, buttonList)

                    }

                })
            } else if (Sub === "logging") {

                if (logchannel === null && logstatus === null) {
                    return interaction.reply(`Nothing was changed!`);
                } else {
                    configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                        if (err) throw err;
                        if (!data) {
                            data = new configurationDB({
                                GuildID: interaction.guildId,
                                LoggingChannel: [
                                    {
                                        Channel: logchannel.id
                                    }
                                ],
                                LoggingStatus: [
                                    {
                                        Status: logstatus
                                    }
                                ],
                            })
                        } else {
                            if (logchannel === null) {

                            } else {
                                data.LoggingChannel.splice(0, 1)
                                const obj = {
                                    Channel: logchannel.id
                                }
                                data.LoggingChannel.push(obj)
                            }

                            if (logstatus === null) {

                            } else {
                                data.LoggingStatus.splice(0, 1)
                                const obj = {
                                    Status: logstatus
                                }
                                data.LoggingStatus.push(obj)
                            }
                        }
                        data.save()
                        interaction.reply(`Server config has been updated!`)
                    });

                }
            }
        })
    },
};
