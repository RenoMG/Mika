const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");
const db = require("../../Models/WarnDB");

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
                .setDescription("Removes specific warning from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("warnid").setRequired(true).setDescription("the warning ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rkick")
                .setDescription("Removes specific kick from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("kickid").setRequired(true).setDescription("the kick ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rmute")
                .setDescription("Removes specific mute from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("muteid").setRequired(true).setDescription("the mute ID.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("rban")
                .setDescription("Removes specific ban from mentioned  user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))
                .addNumberOption(option => option.setName("banid").setRequired(true).setDescription("the ban ID."))),
    async execute(interaction, client, arguments) {
        const Sub = interaction.options.getSubcommand(["total", "warns", "kicks", "mutes", "bans"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason");
        const WarnID = interaction.options.getNumber("warnid") - 1;
        const BanID = interaction.options.getNumber("banid") - 1;
        const MuteID = interaction.options.getNumber("muteid") - 1;
        const KickID = interaction.options.getNumber("kickid") - 1;

        if (Sub === 'total') {
            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - TOTAL`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no infractions.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data.Warns.map((w) => w).length >= 1 || data.Kicks.map((w) => w).length >= 1 || data.Bans.map((w) => w).length >= 1 || data.Mutes.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - TOTAL`)
                            .setColor("GREEN")
                            .addFields(
                                { name: 'Warns', value: `${data.Warns.map((i) => i).length}` },
                                { name: 'Kicks', value: `${data.Kicks.map((i) => i).length}` },
                                { name: 'Mutes', value: `${data.Mutes.map((i) => i).length}` },
                                { name: 'Bans', value: `${data.Bans.map((i) => i).length}` },
                            )
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - TOTAL`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no infractions.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })

        } else if (Sub === 'warns') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data.Warns.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${data.Warns.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })


        } else if (Sub === 'kicks') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICKS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data.Kicks.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICKS`)
                            .setColor("GREEN")
                            .setDescription(`${data.Kicks.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICKS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })

        } else if (Sub === 'mutes') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTES`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data.Mutes.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTES`)
                            .setColor("GREEN")
                            .setDescription(`${data.Mutes.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTES`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })

        } else if (Sub === 'bans') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BANS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data.Bans.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BANS`)
                            .setColor("GREEN")
                            .setDescription(`${data.Bans.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BANS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })

        } else if (Sub === 'rwarn') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data.Content.map((w) => w).length === 0) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data) {
                    data.Content.splice(WarnID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s warning id: ${WarnID + 1} has been removed.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
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

        } else if (Sub === 'rkick') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data.Kicks.map((w) => w).length === 0) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICK REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data) {
                    data.Kicks.splice(KickID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICK REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s kick id: ${KickID + 1} has been removed.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - KICK REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no kicks.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                }
            });

        } else if (Sub === 'rmute') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data.Mutes.map((w) => w).length === 0) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTE REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data) {
                    data.Mutes.splice(MuteID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTE REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s mute id: ${MuteID + 1} has been removed.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - MUTE REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no mutes.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                }
            });

        } else if (Sub === 'rban') {

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data.Bans.map((w) => w).length === 0) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BAN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else if (data) {
                    data.Bans.splice(BanID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BAN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s ban id: ${BanID + 1} has been removed.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`INFRACTIONS - BAN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no bans.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📜 infractions", iconURL: `${process.env.RODGERICON}` })]
                    });
                }
            });

        }
    },
};
