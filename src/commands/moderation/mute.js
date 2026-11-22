const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const ms = require('ms');
const infractionsdb = require("../../Models/InfractionsDB");
const { getGuildConfig } = require("../../functions/getGuildConfig");

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
                .addStringOption(option => option.setName("time").setDescription("optional - how long to mute user.").addChoices({ name: "30 minutes", value: "1800s" }).addChoices({ name: "1 Hour", value: "1h" }).addChoices({ name: "1 Day", value: "1d" }).addChoices({ name: "1 Week", value: "7d" })))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Unmuted mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    permissions: [PermissionFlagsBits.KickMembers],
    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason")
        const Time = interaction.options.getString("time") || " "
        const MuteDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        getGuildConfig(interaction.guild.id).then(async (data) => {
            let getrole = (data.Muterole.map((w) => w.Role))
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Sub === 'add') {

                if (Target.id === interaction.member.id)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot mute yourself!`)] })

                if (Target.permissions.has(PermissionFlagsBits.Administrator))
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot mute an administrator!`)] })

                if (Reason.length > 512)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ The reason cannot exceed 512 characters!`)] })
                
                const filtermuterole = (data.Muterole.map((w) => w.Role).filter(n => n));
                if ((filtermuterole).length === 0) {
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ No mute role is currently set! Please set one with "/config muterole"`)] })
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

                getGuildConfig(interaction.guild.id).then(async (data) => {
                    const status = (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {

                        const timeyesorno = (Time.length === 1 ? 'No time set.' : Time );
                        const logEmbed = new EmbedBuilder()
                            .setColor(Colors.Yellow)
                            .setTitle("MUTE")
                            .setThumbnail(Target.displayAvatarURL())
                            .setDescription(`**${Target.user.username}** has been muted!`)
                            .addFields({ name: '**~** Information', value: stripIndents`• Muted by: ${interaction.user.tag}
                            • ID: ${Target.id}
                            • Muted for: ${timeyesorno}
                            • Reason: ${Reason}
                            • Current number of mutes: ${(data?.Mutes || []).length}`, inline: false })
                            .setTimestamp()
                            .setFooter({ text: "Mika | 📑 Logging", iconURL: `${process.env.MIKAICON}` })

                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                        })
                    }

                })

                interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Yellow).setDescription(`✅ **${Target.user.username}** has been muted! ${Time} | ${Target.id}`).setTimestamp().setFooter({ text: "Mika | 🤫 mute", iconURL: `${process.env.MIKAICON}` })] })
            } else if (Sub === 'remove') {

                Target.roles.remove(getrole)

                getGuildConfig(interaction.guild.id).then(async (data) => {
                    const status = (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                        const logEmbed = new EmbedBuilder()
                            .setColor(Colors.Yellow)
                            .setTitle("UNMUTE")
                            .setThumbnail(Target.displayAvatarURL())
                            .setDescription(`**${Target.user.username}** has been unmuted! | ${Target.id}`)
                            .addFields({ name: '**~** Information', value: stripIndents`• Unmuted by: ${interaction.user.tag}
                            • ID: ${Target.id}
                            • Current number of mutes: ${(data?.Mutes || []).length}`, inline: false })
                            .setTimestamp()
                            .setFooter({ text: "Mika | 📑 Logging", iconURL: `${process.env.MIKAICON}` })

                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                        })
                    }

                })

                interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ **${Target.user.username}** has been unmuted! | ${Target.id}`).setTimestamp().setFooter({ text: "Mika | 🤫 mute", iconURL: `${process.env.MIKAICON}` })] })
            }
        })
    },
};
