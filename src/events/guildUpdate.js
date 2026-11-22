const { Colors, EmbedBuilder } = require('discord.js');
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

                    const logEmbed = new EmbedBuilder()
                        .setTitle("SERVER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server name.\n\n**Original**:\n${oldGuild.name}\n\n**Updated**:\n${newGuild.name}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.iconURL() !== oldGuild.iconURL()) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("SERVER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server icon.\n\n**Original**:\n[Old icon](${oldGuild.iconURL()})\n\n**Updated**:\n[New icon](${newGuild.iconURL()})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.splashURL() !== oldGuild.splashURL()) {

                    const logEmbed = new EmbedBuilder()
                        .setTitle("SERVER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`${executor} updated the server splash.\n\n**Original**:\n[Old Splash](${oldGuild.splashURL()})\n\n**Updated**:\n[New Splash](${newGuild.splashURL()})`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

                } else if (newGuild.ownerId !== oldGuild.ownerId) {

                    const logEmbed = new EmbedBuilder()
                        .setTitle("SERVER UPDATE")
                        .setColor(Colors.Yellow)
                        .setThumbnail(newGuild.iconURL())
                        .setDescription(`Server owner changed.\n\n**Original**:\n${oldGuild.members.cache.get(oldGuild.ownerId)?.user?.username ?? oldGuild.ownerId}\n\n**Updated**:\n${newGuild.members.cache.get(newGuild.ownerId)?.user?.username ?? newGuild.ownerId}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                    return oldGuild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                }
            }

        })

    },
};