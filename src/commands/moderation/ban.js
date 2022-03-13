const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");
const configurationDB = require("../../Models/ConfigurationDB");

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
                .addStringOption(option => option.setName("messages").setRequired(true).setDescription("Choose to delete messages.").addChoice("Don't delete any", "0").addChoice("Previous 7 days", "7")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Unbans mentioned user.')
                .addStringOption(option => option.setName("id").setRequired(true).setDescription("Unbans the mentioned user."))),
    permissions: [Permissions.FLAGS.BAN_MEMBERS],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember('target');
        const BanDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, ephemeral: true })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, ephemeral: true })

            } else if (Sub === 'add') {

                if (Target.id === interaction.member.id)
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot ban yourself!`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })

                if (Target.permissions.has('ADMINISTRATOR'))
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot ban an administrator!`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })

                const Reason = interaction.options.getString('reason');

                if (Reason.length > 512)
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })

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

                Target.ban({ days: Amount, reason: Reason })

                configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
                    if (err) throw err;
                    const status =  (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))
        
                        const logEmbed = new MessageEmbed()
                        .setColor("RED")
                        .setTitle("BAN")
                        .setDescription(`✅ **${Target.user.username}** has been banned! | ${Target.id}`)
                        .setTimestamp()
                        .setFooter({ text: "Rodger | 📑 Logging", iconURL: `${process.env.RODGERICON}` })
        
                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                    }
        
                })

                interaction.reply({ embeds: [new MessageEmbed().setColor("RED").setDescription(`✅ **${Target.user.username}** has been banned! | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })
            } else if (Sub === 'remove') {
                const userID = interaction.options.getString('id');

                if (userID === interaction.member.id)
                    return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot unban yourself... How would you anyways?`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })

                interaction.guild.members.unban(userID).then((user) => {
                    interaction.reply({ embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${userID}** has been unbanned!`).setTimestamp().setFooter({ text: "Rodger | 🚫 ban", iconURL: `${process.env.RODGERICON}` })] })
                }).catch(() => {
                    return interaction.reply(`Please specify a valid banned user's ID.`)
                });

                configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
                    if (err) throw err;
                    const status =  (data.LoggingStatus.map((w) => w.Status));
                    if (`${status}` === 'true') {
                        loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))
        
                        const logEmbed = new MessageEmbed()
                        .setColor("RED")
                        .setTitle("BAN")
                        .setDescription(`✅ **${userID}** has been unbanned by ${interaction.user.tag}!`)
                        .setTimestamp()
                        .setFooter({ text: "Rodger | 📑 Logging", iconURL: `${process.env.RODGERICON}` })
        
                        interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                    }
        
                })
            }
        })
    },
};
