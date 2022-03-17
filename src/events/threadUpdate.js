const { SlashCommandBuilder, roleMention } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'threadUpdate',
    async execute(oldThread, newThread) {

        configurationDB.findOne({ GuildID: newThread.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await newThread.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                if (oldThread.name !== newThread.name) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("THREAD UPDATED")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the thread name for <#${newThread.id}>.\n**Original**:\n${oldThread.name}\n**Updated**:\n<#${newThread.id}>`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return newThread.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {

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

                    const logEmbed = new MessageEmbed()
                        .setTitle("THREAD UPDATED")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the thread slowmode for <#${newThread.id}>.\n**Original**:\n${fancyTimeFormat(oldThread.rateLimitPerUser)}\n**Updated**:\n${fancyTimeFormat(newThread.rateLimitPerUser)}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return newThread.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (oldThread.archived !== newThread.archived) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("THREAD UPDATED")
                        .setColor("YELLOW")
                        .setDescription(`${executor} updated the thread archive status for <#${newThread.id}>.\n**Original**:\n${oldThread.archived ? "Archived" : "Not Archived"}\n**Updated**:\n${newThread.archived ? "Archived" : "Not Archived"}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return newThread.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                }

            }

        })

    },
};