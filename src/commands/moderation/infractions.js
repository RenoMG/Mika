const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");
const db = require("../../Models/WarnDB");
const { getGuildConfig, getUserInfractions, getUserWarns } = require("../../functions/getGuildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('infractions')
        .setDescription('Infractions management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName("total")
                .setDescription("Displays total infractions of user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("warns")
                .setDescription("Detailed list of warnings.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("kicks")
                .setDescription("Detailed list of kicks.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("mutes")
                .setDescription("Detailed list of mutes.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("bans")
                .setDescription("Detailed list of bans.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rwarn")
                .setDescription("Removes specific warning from mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("warnid").setRequired(true).setDescription("the warning ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rkick")
                .setDescription("Removes specific kick from mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("kickid").setRequired(true).setDescription("the kick ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rmute")
                .setDescription("Removes specific mute from mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("muteid").setRequired(true).setDescription("the mute ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rban")
                .setDescription("Removes specific ban from mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("banid").setRequired(true).setDescription("the ban ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("clear")
                .setDescription("Clears all infractions from mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    async execute(interaction, client, arguments) {
        const Sub = interaction.options.getSubcommand(["total", "warns", "kicks", "mutes", "bans", "clear", "rwarn", "rkick", "rmute", "rban"])
        const Target = interaction.options.getMember("target");
        const WarnID = interaction.options.getNumber("warnid") - 1;
        const BanID = interaction.options.getNumber("banid") - 1;
        const MuteID = interaction.options.getNumber("muteid") - 1;
        const KickID = interaction.options.getNumber("kickid") - 1;

        getGuildConfig(interaction.guild.id).then(async (data) => {
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Sub === 'total') {
                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - TOTAL`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no infractions.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if ((data?.Warns || []).length >= 1 || (data?.Kicks || []).length >= 1 || (data?.Bans || []).length >= 1 || (data?.Mutes || []).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - TOTAL`)
                                .setColor(Colors.Blue)
                                .addFields(
                                    { name: 'Warns', value: `${(data?.Warns || []).length}` },
                                    { name: 'Kicks', value: `${(data?.Kicks || []).length}` },
                                    { name: 'Mutes', value: `${(data?.Mutes || []).length}` },
                                    { name: 'Bans', value: `${(data?.Bans || []).length}` },
                                )
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - TOTAL`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no infractions.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    }

                })

            } else if (Sub === 'warns') {

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if ((data?.Warns || []).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${data.Warns.map(
                                    (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                                ).join(" ")}`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARNS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    }

                })


            } else if (Sub === 'kicks') {

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICKS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if ((data?.Kicks || []).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICKS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${data.Kicks.map(
                                    (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                                ).join(" ")}`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICKS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    }

                })

            } else if (Sub === 'mutes') {

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTES`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if ((data?.Mutes || []).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTES`)
                                .setColor(Colors.Blue)
                                .setDescription(`${data.Mutes.map(
                                    (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                                ).join(" ")}`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTES`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    }

                })

            } else if (Sub === 'bans') {

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BANS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if ((data?.Bans || []).length >= 1) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BANS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${data.Bans.map(
                                    (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                                ).join(" ")}`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BANS`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });

                    }

                })

            } else if (Sub === 'rwarn') {

                getUserWarns(interaction.guildId, Target.id, `<@!${Target.id}>`).then(async (data) => {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return await interaction.reply(`You do not have permission to use this command!`);

                    if ((data?.Content || []).length === 0) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if (data) {
                        data.Content.splice(WarnID, 1)
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARN REMOVE`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s warning id: ${WarnID + 1} has been removed.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                        data.save()
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - WARN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    }
                });

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (data && Array.isArray(data.Warns)) {
                        data.Warns.splice(WarnID, 1)
                        data.save()
                    }
                });

            } else if (Sub === 'rkick') {

                getUserInfractions(interaction.guildId, Target.id, `<@!${Target.id}>`).then(async (data) => {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return await interaction.reply(`You do not have permission to use this command!`);

                    if ((data?.Kicks || []).length === 0) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICK REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if (data) {
                        data.Kicks.splice(KickID, 1)
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICK REMOVE`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s kick id: ${KickID + 1} has been removed.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                        data.save()
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - KICK REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    }
                });

            } else if (Sub === 'rmute') {

                getUserInfractions(interaction.guildId, Target.id, `<@!${Target.id}>`).then(async (data) => {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return await interaction.reply(`You do not have permission to use this command!`);

                    if ((data?.Mutes || []).length === 0) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTE REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if (data) {
                        data.Mutes.splice(MuteID, 1)
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTE REMOVE`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s mute id: ${MuteID + 1} has been removed.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                        data.save()
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - MUTE REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    }
                });

            } else if (Sub === 'rban') {

                getUserInfractions(interaction.guildId, Target.id, `<@!${Target.id}>`).then(async (data) => {
                    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return await interaction.reply(`You do not have permission to use this command!`);

                    if ((data?.Bans || []).length === 0) {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BAN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else if (data) {
                        data.Bans.splice(BanID, 1)
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BAN REMOVE`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s ban id: ${BanID + 1} has been removed.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                        data.save()
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - BAN REMOVE`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    }
                });

            } else if (Sub === 'clear') {

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (data) {
                        if (err) throw err;

                        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return await interaction.reply(`You do not have permission to use this command!`);

                        await db.findOneAndDelete({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` })
                        await infractionsdb.findOneAndDelete({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` })
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - CLEAR`)
                                .setColor(Colors.Green)
                                .setDescription(`${Target.user.tag}'s infractions were cleared. | ${Target.id}`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    } else {
                        interaction.reply({
                            embeds: [new EmbedBuilder()
                                .setTitle(`INFRACTIONS - CLEAR`)
                                .setColor(Colors.Blue)
                                .setDescription(`${Target.user.tag} | ${Target.id} | Has no infractions.`)
                                .setTimestamp()
                                .setFooter({ text: "Mika | 📜 infractions", iconURL: `${process.env.MIKAICON}` })]
                        });
                    }
                })

            }
        })
    },
};
