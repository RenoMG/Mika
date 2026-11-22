const { Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'threadCreate',
    async execute(thread) {

        configurationDB.findOne({ GuildID: thread.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await thread.guild.fetchAuditLogs({
                    limit: 1,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, changes, extra, action } = channelCreateLog;


                    const logEmbed = new EmbedBuilder()
                        .setTitle("THREAD CREATED")
                        .setColor(Colors.Yellow)
                        .setDescription(`${executor} created the thread <#${thread.id}>.\n\n**Thread information**:\n• Thread ID: ${thread.id}\n• Parent channel: <#${thread.parent.id}>\n• Archive time: ${thread.autoArchiveDuration.toString().replace(/undefined/gi, "Not set").replace(/60/gi, "1 hour").replace(/1440/gi, "24 hours").replace(/4320/gi, "3 Days").replace(/10080/gi, "1 week")}`.slice("0", "4096"))
                        .setTimestamp()
                        .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });

                    return thread.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })

            }

        })

    },
};