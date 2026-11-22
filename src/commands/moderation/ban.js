const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");
const { getGuildConfig } = require("../../functions/getGuildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Bans mentioned user.')
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("Bans the mentioned user."))
                .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for ban."))
                .addStringOption(option => option.setName("messages").setRequired(true).setDescription("Choose to delete messages.").addChoices({ name: "Don't delete any", value: "0" }).addChoices({ name: "Previous 7 days", value: "7" })))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Unbans mentioned user.')
                .addStringOption(option => option.setName("id").setRequired(true).setDescription("Unbans the mentioned user."))),
    permissions: [PermissionFlagsBits.BanMembers],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember('target');
        const BanDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        getGuildConfig(interaction.guild.id).then(async (data) => {
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Sub === 'add') {

                if (Target.id === interaction.member.id)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot ban yourself!`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })

                if (Target.permissions.has(PermissionFlagsBits.Administrator))
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot ban an administrator!`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })

                const Reason = interaction.options.getString('reason');

                if (Reason.length > 512)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ The reason cannot exceed 512 characters!`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })

                infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        data = new infractionsdb({
                            GuildID: interaction.guildId,
                            UserID: Target.id,
                            UserTag: `<@!${Target.id}>`,
                            Bans: [
                                {
                                    ExecuterID: interaction.user.id,
                                    ExecuterTag: `<@!${interaction.user.id}>`,
                                    Reason: Reason,
                                    Date: BanDate
                                }
                            ],
                        })
                    } else {
                        const obj = {
                            ExecuterID: interaction.user.id,
                            ExecuterTag: `<@!${interaction.user.id}>`,
                            Reason: Reason,
                            Date: BanDate
                        }
                        data.Bans.push(obj)
                    }
                    data.save()
                });

                const Amount = interaction.options.getString('messages')

                Target.ban({ deleteMessageSeconds: Number(Amount) * 24 * 60 * 60, reason: Reason })

                getGuildConfig(interaction.guild.id).then(async (data) => {
                    const status =  (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
        
                        const logEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle("BAN")
                        .setThumbnail(Target.displayAvatarURL())
                        .setDescription(`**${Target.user.username}** has been banned!`)
                        .addFields({ name: '**~** Information', value: stripIndents`• Banned by: ${interaction.user.tag}
                        • ID: ${Target.id}
                        • Reason: ${Reason}
                        • Current number of bans: ${(data?.Bans || []).length}`, inline: false })
                        .setTimestamp()
                        .setFooter({ text: "Mika | 📑 Logging", iconURL: `${process.env.MIKAICON}` })
        
                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                        })
                    }
        
                })

                interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`✅ **${Target.user.username}** has been banned! | ${Target.id}`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })
            } else if (Sub === 'remove') {
                const userID = interaction.options.getString('id');

                if (userID === interaction.member.id)
                    return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot unban yourself... How would you anyways?`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })

                interaction.guild.members.unban(userID).then((user) => {
                    interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Green).setDescription(`✅ **${userID}** has been unbanned!`).setTimestamp().setFooter({ text: "Mika | 🚫 ban", iconURL: `${process.env.MIKAICON}` })] })
                }).catch(() => {
                    return interaction.reply(`Please specify a valid banned user's ID.`)
                });

                getGuildConfig(interaction.guild.id).then(async (data) => {
                    const status =  (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                        infractionsdb.findOne({ GuildID: interaction.guildId, UserID: userID, UserTag: `<@!${userID}>` }, async (err, data) => {
        
                        const logEmbed = new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle("BAN")
                        .setDescription(`**${userID}** has been unbanned!`)
                        .addFields({ name: '**~** Information', value: stripIndents`• Unbanned by: ${interaction.user.tag}
                        • Current number of bans: ${(data?.Bans || []).length}`, inline: false })
                        .setTimestamp()
                        .setFooter({ text: "Mika | 📑 Logging", iconURL: `${process.env.MIKAICON}` })
        
                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                        })
                    }
        
                })
            }
        })
    },
};
