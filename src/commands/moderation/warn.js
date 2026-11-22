const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const db = require("../../Models/WarnDB");
const infractionsdb = require("../../Models/InfractionsDB");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warning management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("Warns mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for the warning.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("check")
                .setDescription("Check warns for mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Removes specific warning from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("warnid").setRequired(true).setDescription("the warning ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clears all warnings from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    permissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction, client, arguments) {
        const Sub = interaction.options.getSubcommand(["add", "check", "remove", "clear"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason");
        const WarnID = interaction.options.getNumber("warnid") - 1;
        const WarnDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Sub === 'add') {

                if (Target.id === interaction.member.id)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot warn yourself!`)] })

                if (Target.permissions.has(PermissionFlagsBits.Administrator))
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot warn an administrator!`)] })

                if (Reason.length > 512)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ The reason cannot exceed 512 characters!`)] })

                db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        data = new db({
                            GuildID: interaction.guildId,
                            UserID: Target.id,
                            UserTag: `<@!${Target.id}>`,
                            Content: [
                                {
                                    ExecuterID: interaction.user.id,
                                    ExecuterTag: `<@!${interaction.user.id}>`,
                                    Reason: Reason,
                                    Date: WarnDate
                                }
                            ],
                        })
                    } else {
                        const obj = {
                            ExecuterID: interaction.user.id,
                            ExecuterTag: `<@!${interaction.user.id}>`,
                            Reason: Reason,
                            Date: WarnDate
                        }
                        data.Content.push(obj)
                    }
                    data.save()
                });

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        data = new infractionsdb({
                            GuildID: interaction.guildId,
                            UserID: Target.id,
                            UserTag: `<@!${Target.id}>`,
                            Warns: [
                                {
                                    ExecuterID: interaction.user.id,
                                    ExecuterTag: `<@!${interaction.user.id}>`,
                                    Reason: Reason,
                                    Date: WarnDate
                                }
                            ],
                        })
                    } else {
                        const obj = {
                            ExecuterID: interaction.user.id,
                            ExecuterTag: `<@!${interaction.user.id}>`,
                            Reason: Reason,
                            Date: WarnDate
                        }
                        data.Warns.push(obj)
                    }
                    data.save()
                });

                configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
                    if (err) throw err;
                    const status =  (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
        
                        const logEmbed = new EmbedBuilder()
                        .setTitle(`WARN`)
                        .setColor(Colors.Yellow)
                        .setThumbnail(Target.displayAvatarURL())
                        .setDescription(`**${Target.user.username}** Has been warned!`)
                        .addFields({ name: '**~** Information', value: stripIndents`• Warned by: ${interaction.user.tag}
                        • ID: ${Target.id}
                        • Reason: ${Reason}
                        • Current number of warns: ${data.Warns.map((i) => i).length}`, inline: false })
                        .setTimestamp()
                        .setFooter({ text: "Rodger | 📑 Logging", iconURL: `${process.env.RODGERICON}` })
        
                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                        })
                    }
        
                })

                interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle(`WARN`)
                        .setColor(Colors.Yellow)
                        .setDescription(`${Target.user.tag} Has been warned! | ${Target.id}\n**Reason**: ${Reason}`)
                        .setTimestamp()
                        .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                });

            } else if (Sub === 'check') {

                db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                    } else if (data.Content.map((w) => w).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${data.Content.map(
                                    (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                                ).join(" ")}`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });


                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });

                    }

                })


            } else if (Sub === 'remove') {

                db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (data.Content.map((w) => w).length === 0) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                    } else if (data) {
                        data.Content.splice(WarnID, 1)
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARN REMOVE`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s warning id: ${WarnID + 1} has been removed.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                        data.save()
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                    }
                });

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (data) {
                        data.Warns.splice(WarnID, 1)
                        data.save()
                    }
                });

            } else if (Sub === 'clear') {

                db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (data) {
                        await db.findOneAndDelete({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` })
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARN CLEAR`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s warnings were cleared. | ${Target.id}`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`WARN CLEAR`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                        });
                    }
                })

            }
        })
    },
};
