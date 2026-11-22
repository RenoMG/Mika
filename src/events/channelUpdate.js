const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { duration } = require('moment');
const { getGuildConfig } = require("../utils/getGuildConfig");


module.exports = {
    name: 'channelUpdate',
    async execute(oldChannel, newChannel) {

        getGuildConfig(oldChannel.guild.id).then(async (data) => {
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldChannel.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                const count = 1950;

                if (oldChannel.userLimit !== newChannel.userLimit) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel userlimit for <#${oldChannel.id}>.\n\n**Original**:\n${oldChannel.userLimit}\n\n**Updated**:\n${newChannel.userLimit}`)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (oldChannel.bitrate !== newChannel.bitrate) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel bitrate for <#${oldChannel.id}>.\n\n**Original**:\n${oldChannel.bitrate}\n\n**Updated**:\n${newChannel.bitrate}`)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (oldChannel.rawPosition !== newChannel.rawPosition) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel position for <#${oldChannel.id}>.\n\n**Original**:\n${oldChannel.rawPosition}\n\n**Updated**:\n${newChannel.rawPosition}`)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (action === AuditLogEvent.ChannelOverwriteUpdate) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel permissions in <#${oldChannel.id}>.`)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (changes[0].key === 'topic' && changes[0].old === undefined) {
                    const edited = changes[0].new.slice(0, count) + (changes[0].new.length > count ? "..." : "")
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel topic in <#${oldChannel.id}>.\n\n**Original**:\n${`Not Set`}\n\n**Updated**:\n${edited}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (changes[0].key === 'topic' && changes[0].new === undefined) {
                    const original = changes[0].old.slice(0, count) + (changes[0].old.length > count ? "..." : "")
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel topic in <#${oldChannel.id}>.\n\n**Original**:\n${original}\n\n**Updated**:\n${`Not set`}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else if (changes[0].key === 'topic') {
                    const original = changes[0].old.slice(0, count) + (changes[0].old.length > count ? "..." : "")
                    const edited = changes[0].new.slice(0, count) + (changes[0].new.length > count ? "..." : "")
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel topic in <#${oldChannel.id}>.\n\n**Original**:\n${original}\n\n**Updated**:\n${edited}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else if (changes[0].key === 'name') {
                    const original = changes[0].old.slice(0, count) + (changes[0].old.length > count ? "..." : "")
                    const edited = changes[0].new.slice(0, count) + (changes[0].new.length > count ? "..." : "")
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel name for <#${oldChannel.id}>.\n\n**Original**:\n${original}\n\n**Updated**:\n${edited}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (changes[0].key === 'rate_limit_per_user') {

                    function fancyTimeFormat(duration) {
                        // Hours, minutes and seconds
                        var hrs = ~~(duration / 3600);
                        var mins = ~~((duration % 3600) / 60);
                        var secs = ~~duration % 60;

                        // Output like "1:01" or "4:03:59" or "123:03:59"
                        var ret = "";

                        if (hrs > 0) {
                            ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
                        }

                        ret += "" + mins + ":" + (secs < 10 ? "0" : "");
                        ret += "" + secs;
                        return ret;
                    }


                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel slowmode for <#${oldChannel.id}>.\n\n**Original**:\n${fancyTimeFormat(changes[0].old)}\n\n**Updated**:\n${fancyTimeFormat(changes[0].new)}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else if (changes[0].key === 'nsfw') {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the nsfw status for <#${oldChannel.id}>.\n\n**Original**:\n${changes[0].old.toString().replace(/false/gi, "Disabled").replace(/true/gi, "Enabled")}\n\n**Updated**:\n${changes[0].new.toString().replace(/false/gi, "Disabled").replace(/true/gi, "Enabled")}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else if (changes[0].key === 'type') {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the announcement status for <#${oldChannel.id}>.\n\n**Original**:\n${changes[0].old.toString().replace(/0/gi, "Disabled").replace(/5/gi, "Enabled")}\n\n**Updated**:\n${changes[0].new.toString().replace(/0/gi, "Disabled").replace(/5/gi, "Enabled")}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else if (changes[0].key === 'default_auto_archive_duration') {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("CHANNEL UPDATE")
                        .setColor(Colors.Yellow)
                        .setDescription(`User ${executor} has updated the channel thread archive duration in <#${oldChannel.id}>.\n\n**Original**:\n${changes[0].old.toString().replace(/undefined/gi, "Not set").replace(/60/gi, "1 hour").replace(/1440/gi, "24 hours").replace(/4320/gi, "3 Days").replace(/10080/gi, "1 week")}\n\n**Updated**:\n${changes[0].new.toString().replace(/undefined/gi, "Not set").replace(/60/gi, "1 hour").replace(/1440/gi, "24 hours").replace(/4320/gi, "3 Days").replace(/10080/gi, "1 week")}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return oldChannel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }

            }

        })

    },
};