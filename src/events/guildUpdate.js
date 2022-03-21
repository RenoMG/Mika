const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'guildUpdate',
    async execute(oldGuild, newGuild) {

        configurationDB.findOne({ GuildID: oldGuild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldGuild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;

                if (newGuild.name !== oldGuild.name) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("SERVER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server name.\n\n**Original**:\n${oldGuild.name}\n\n**Updated**:\n${newGuild.name}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.iconURL() !== oldGuild.iconURL()) {
                    const logEmbed = new MessageEmbed()
                        .setTitle("SERVER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server icon.\n\n**Original**:\n[Old icon](${oldGuild.iconURL()})\n\n**Updated**:\n[New icon](${newGuild.iconURL()})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.splashURL() !== oldGuild.splashURL()) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("SERVER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server splash.\n\n**Original**:\n[Old Splash](${oldGuild.splashURL()})\n\n**Updated**:\n[New Splash](${newGuild.splashURL()})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.ownerId !== oldGuild.ownerId) {

                    const logEmbed = new MessageEmbed()
                        .setTitle("SERVER UPDATE")
                        .setColor("YELLOW")
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`Server owner changed.\n\n**Original**:\n${oldGuild.owner.user.username}\n\n**Updated**:\n${newGuild.owner.user.username}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }
            }

        })

    },
};