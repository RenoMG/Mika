const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const { stripIndents } = require("common-tags");
const ms = require('ms');
const infractionsdb = require("../../Models/InfractionsDB");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Mutes mentioned user.')
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("Mutes the mentioned user."))
                .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for mute."))
                .addStringOption(option => option.setName("time").setDescription("optional - how long to mute user.").addChoice("30 minutes", "1800s").addChoice("1 Hour", "1h").addChoice("1 Day", "1d").addChoice("1 Week", "7d")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Unmuted mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    permissions: [Permissions.FLAGS.KICK_MEMBERS],
    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason")
        const Time = interaction.options.getString("time") || " "
        const MuteDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            let getrole = (data.Muterole.map((w) => w.Role))
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

            } else if (Sub === 'add') {

                if (Target.id === interaction.member.id)
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot mute yourself!`)] })

                if (Target.permissions.has('ADMINISTRATOR'))
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot mute an administrator!`)] })

                if (Reason.length > 512)
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`)] })
                
                const filtermuterole = (data.Muterole.map((w) => w.Role).filter(n => n));
                if ((filtermuterole).length === 0) {
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ No mute role is currently set! Please set one with "/config muterole"`)] })
                }

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        data = new infractionsdb({
                            GuildID: interaction.guildId,
                            UserID: Target.id,
                            UserTag: `<@!${Target.id}>`,
                            Mutes: [
                                {
                                    ExecuterID: interaction.user.id,
                                    ExecuterTag: `<@!${interaction.user.id}>`,
                                    Reason: Reason,
                                    Date: MuteDate
                                }
                            ],
                        })
                    } else {
                        const obj = {
                            ExecuterID: interaction.user.id,
                            ExecuterTag: `<@!${interaction.user.id}>`,
                            Reason: Reason,
                            Date: MuteDate
                        }
                        data.Mutes.push(obj)
                    }
                    data.save()
                });

                await Target.roles.add(getrole)
                setTimeout(async () => {
                    if (!Target.roles.cache.has(getrole)) return;
                    await Target.roles.remove(getrole)
                }, (ms(Time)))

                configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
                    if (err) throw err;
                    const status = (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        const logEmbed = new MessageEmbed()
                            .setColor("YELLOW")
                            .setTitle("MUTE")
                            .setDescription(`✅ **${Target.user.username}** has been muted by ${interaction.user.tag}! ${Time} | ${Target.id}`)
                            .setTimestamp()
                            .setFooter({ text: "Rodger | 📑 Logging", iconURL: `${process.env.RODGERICON}` })

                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                    }

                })

                interaction.reply({ embeds: [new MessageEmbed().setColor("YELLOW").setDescription(`✅ **${Target.user.username}** has been muted! ${Time} | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 🤫 mute", iconURL: `${process.env.RODGERICON}` })] })
            } else if (Sub === 'remove') {

                Target.roles.remove(getrole)

                interaction.reply({ embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.user.username}** has been unmuted! | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 🤫 mute", iconURL: `${process.env.RODGERICON}` })] })
            }
        })
    },
};
