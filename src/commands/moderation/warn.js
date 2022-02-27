const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const db = require("../../Models/WarnDB");

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
    permissions: [Permissions.FLAGS.KICK_MEMBERS],
    async execute(interaction, client, arguments) {
        const Sub = interaction.options.getSubcommand(["add", "check", "remove", "clear"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason");
        const WarnID = interaction.options.getNumber("warnid") - 1;
        const WarnDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        if (Sub === 'add') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>`}, async (err, data) => {
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
                    .setDescription(`${Target.user.tag} Has been warned! | ${Target.id}\n**Reason**: ${Reason}`)]
            });

        } else if (Sub === 'check') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>`}, async (err, data) => {
                if (err) throw err;
                if (data.Content.map((w) => w).length >= 1) {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${data.Content.map(
                                (w, i) => `**ID**: ${i + 1}\n**By**: ${w.ExecuterTag}\n**Date**: ${w.Date}\n**Reason**: ${w.Reason}
                        \n`
                            ).join(" ")}`)]
                    });


                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARNS`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)]
                    });

                }

            })


        } else if (Sub === 'remove') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>`}, async (err, data) => {
                if (err) throw err;
                if (data) {
                    data.Content.splice(WarnID, 1)
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s warning id: ${WarnID + 1} has been removed.`)]
                    });
                    data.save()
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN REMOVE`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)]
                    });
                }
            })


        } else if (Sub === 'clear') {

            db.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>`}, async (err, data) => {
                if (err) throw err;
                if (data) {
                    await db.findOneAndDelete({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>`})
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN CLEAR`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag}'s warnings were cleared. | ${Target.id}`)]
                    });
                } else {
                    interaction.reply({
                        embeds: [new MessageEmbed()
                            .setTitle(`WARN CLEAR`)
                            .setColor("GREEN")
                            .setDescription(`${Target.user.tag} | ${Target.id} | Has no warnings.`)]
                    });
                }
            })

        }
    },
};
