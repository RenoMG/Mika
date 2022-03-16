const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {

        configurationDB.findOne({ GuildID: oldMember.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                console.log(newMember)

                if (newMember.nickname !== oldMember.nickname) {
                    let oldNickname = oldMember.nickname ? oldMember.nickname : oldMember.user.username
                    let newNickname = newMember.nickname ? newMember.nickname : newMember.user.username

                    const logEmbed = new MessageEmbed()
                        .setTitle("MEMBER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their nickname.\n**Original**:\n${oldNickname}\n**Updated**:\n${newNickname}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newMember.user.username !== oldMember.user.username) {
                    let oldusername = oldMember.user.username
                    let newusername = newMember.user.username

                    const logEmbed = new MessageEmbed()
                        .setTitle("MEMBER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their username.\n**Original**:\n${oldusername}\n**Updated**:\n${newusername}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newMember.avatarURL() !== oldMember.avatarURL()) {
                    let oldavatar = oldMember.user.avatarURL()
                    let newavatar = newMember.user.avatarURL()

                    const logEmbed = new MessageEmbed()
                        .setTitle("MEMBER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their avatar.\n**Original**:\n[Old avatar](${oldavatar})\n**Updated**:\n[New avatar](${newavatar})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }
            }

        })

    },
};