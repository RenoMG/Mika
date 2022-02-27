const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");

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
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    async execute(interaction, client, arguments) {
        const Sub = interaction.options.getSubcommand(["total", "warns", "kicks", "mutes", "bans"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason");
        const WarnID = interaction.options.getNumber("warnid") - 1;
        const WarnDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        if (Sub === 'add') {

            if (Target.id === interaction.member.id)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot warn yourself!`)] })

            if (Target.permissions.has('ADMINISTRATOR'))
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot warn an administrator!`)] })

            if (Reason.length > 512)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`)] })

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

            interaction.reply({
                embeds: [new MessageEmbed()
                    .setTitle(`WARN`)
                    .setColor("GREEN")
                    .setDescription(`${Target.user.tag} Has been warned! | ${Target.id}\n**Reason**: ${Reason}`)
                    .setTimestamp()
                    .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
            });

        } else if (Sub === 'check') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data.Content.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${data.Content.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });


                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });

                }

            })


        } else if (Sub === 'remove') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data) {
                    data.Content.splice(WarnID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s warning id: ${WarnID + 1} has been removed.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });
                }
            })


        } else if (Sub === 'clear') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (data) {
                    await db.findOneAndDelete({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` })
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN CLEAR`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s warnings were cleared. | ${Target.id}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN CLEAR`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | ⚠️ warn", iconURL: `${process.env.RODGERICON}` })]
                    });
                }
            })

        }
    },
};
