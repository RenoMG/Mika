const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../utils/getGuildConfig");

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {

        getGuildConfig(oldMember.guild.id).then(async (data) => {
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                console.log(newMember)

                if (newMember.nickname !== oldMember.nickname) {
                    let oldNickname = oldMember.nickname ? oldMember.nickname : oldMember.user.username
                    let newNickname = newMember.nickname ? newMember.nickname : newMember.user.username

                    const logEmbed = new EmbedBuilder()
                        .setTitle("MEMBER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their nickname.\n\n**Original**:\n${oldNickname}\n\n**Updated**:\n${newNickname}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newMember.user.username !== oldMember.user.username) {
                    let oldusername = oldMember.user.username
                    let newusername = newMember.user.username

                    const logEmbed = new EmbedBuilder()
                        .setTitle("MEMBER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their username.\n\n**Original**:\n${oldusername}\n\n**Updated**:\n${newusername}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newMember.avatarURL() !== oldMember.avatarURL()) {
                    let oldavatar = oldMember.user.avatarURL()
                    let newavatar = newMember.user.avatarURL()

                    const logEmbed = new EmbedBuilder()
                        .setTitle("MEMBER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newMember.displayAvatarURL())
                        .setDescription(`<@${newMember.id}> updated their avatar.\n\n**Original**:\n[Old avatar](${oldavatar})\n\n**Updated**:\n[New avatar](${newavatar})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldMember.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }
            }

        })

    },
};