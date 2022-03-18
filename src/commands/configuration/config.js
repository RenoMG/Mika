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
                .addChannelOption(option => option.setName("channel").addChannelTypes([0]).setDescription("Set channel for logs to be sent to.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('autorole')
                .setDescription('Logging config')
                .addStringOption(option => option.setName("status").setDescription("Enable or disable auto-role").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addRoleOption(option => option.setName("role").setDescription("Set auto-role to give to new users."))),
    permissions: [Permissions.FLAGS.BAN_MEMBERS],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["welcome", "command", "info", "logging", "autorole"])
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
        const autorole = interaction.options.getRole("role");
        const autorolestatus = interaction.options.getString("status")

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

                        const greetingstatuscheck = (data.GreetingStatus.map((w) => w.Status));
                        const farewellstatuscheck = (data.FarewellStatus.map((w) => w.Status));
                        const filtergreetingchannel = (data.GreetingChannel.map((w) => w.Channel).filter(n => n));
                        const filterfarewellchannel = (data.FarewellChannel.map((w) => w.Channel).filter(n => n));
                        const embed1 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("BLUE")
                            .setDescription("Welcome config")
                            .addFields({ name: 'Greeting status', value: `${`${greetingstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Farewell status', value: `${`${farewellstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Greeting channel', value: `${`${(filtergreetingchannel).length >= 1}` === "true" ? `**${(filtergreetingchannel.map(i => '<#' +i+'>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true },
                                { name: 'Farewell channel', value: `${`${(filterfarewellchannel).length >= 1}` === "true" ? `**${(filterfarewellchannel.map(i => '<#' +i+'>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true },
                                { name: 'Greeting message', value: `${data.GreetingMessage.map((w) => w.Message)}`, inline: true },
                                { name: 'Farewell message', value: `${data.FarewellMessage.map((w) => w.Message)}`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

                        const moderationstatuscheck = (data.ModerationCommandStatus.map((w) => w.Status));
                        const redditstatuscheck = (data.RedditCommandStatus.map((w) => w.Status));
                        const socialstatuscheck = (data.SocialCommandStatus.map((w) => w.Status));
                        const imagestatuscheck = (data.ImageCommandStatus.map((w) => w.Status));
                        const infostatuscheck = (data.InfoCommandStatus.map((w) => w.Status));
                        const disabledchannelfix = (data.DisabledChannels.map((w) => w.Channels));
                        const filterdisabledchannels = (data.DisabledChannels.map((w) => w.Channels).filter(n => n));
                        const embed2 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("BLUE")
                            .setDescription("Command status config")
                            .addFields({ name: 'Moderation status', value: `${`${moderationstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Reddit status', value: `${`${redditstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Social status', value: `${`${socialstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Image status', value: `${`${imagestatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Infromation status', value: `${`${infostatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Restricted channels', value: stripIndents`${`${(disabledchannelfix).length >= 2}` === "true" ? `**${(filterdisabledchannels.map(i => '• <#' +i+'>\n')).toString().replace(/,/gi, "")}**` : "No channels set"}`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

                        const loggingstatuscheck = (data.LoggingStatus.map((w) => w.Status));
                        const filterloggingchannel = (data.LoggingChannel.map((w) => w.Channel).filter(n => n));
                        const embed3 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("BLUE")
                            .setDescription("Logging status config")
                            .addFields({ name: 'Logging status', value: `${`${loggingstatuscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Logging channel', value: `${`${(filterloggingchannel).length >= 1}` === "true" ? `**${(filterloggingchannel.map(i => '<#' +i+'>')).toString().replace(/,/gi, "")}**` : "No channel set"}`, inline: true })
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 🖥️ config", iconURL: `${process.env.RODGERICON}` })

                        const autorolestatscheck = (data.AutoroleStatus.map((w) => w.Status));
                        const filterautorole = (data.AutoroleRole.map((w) => w.Role).filter(n => n));
                        const embed4 = new MessageEmbed()
                            .setTitle(`SERVER CONFIGURATION`)
                            .setColor("BLUE")
                            .setDescription("Auto-role status config")
                            .addFields({ name: 'Auto-role status', value: `${`${autorolestatscheck}` === "true" ? "🟢 Enabled" : "🔴 Disabled"}`, inline: true },
                                { name: 'Auto-role role', value: `${`${(filterautorole).length >= 1}` === "true" ? `**${(filterautorole.map(i => '<@&' +i+'>')).toString().replace(/,/gi, "")}**` : "No role set"}`, inline: true })
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
                            embed3,
                            embed4
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
            } else if (Sub === "autorole") {

                if (autorole === null && autorolestatus === null) {
                    return interaction.reply(`Nothing was changed!`);
                } else {
                    configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                        if (err) throw err;
                        if (!data) {
                            data = new configurationDB({
                                GuildID: interaction.guildId,
                                AutoroleStatus: [
                                    {
                                        Status: autorolestatus
                                    }
                                ],
                                AutoroleRole: [
                                    {
                                        Role: autorole.id
                                    }
                                ],
                            })
                        } else {
                            if (autorole === null) {

                            } else {
                                data.AutoroleRole.splice(0, 1)
                                const obj = {
                                    Role: autorole.id
                                }
                                data.AutoroleRole.push(obj)
                            }

                            if (autorolestatus === null) {

                            } else {
                                data.AutoroleStatus.splice(0, 1)
                                const obj = {
                                    Status: autorolestatus
                                }
                                data.AutoroleStatus.push(obj)
                            }
                        }
                        data.save()
                        interaction.reply(`Server config has been updated!`)
                    });
                }
            }
        })
    }
}
