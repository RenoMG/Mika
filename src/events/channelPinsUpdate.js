const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../functions/getGuildConfig");


module.exports = {
    name: 'channelPinsUpdate',
    async execute(channel) {

        getGuildConfig(channel.guild.id).then(async (data) => {
            const status = (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await channel.guild.fetchAuditLogs({
                    limit: 6,
                });

                const channelPinUpdateLog = fetchedLogs.entries.find((entry) =>
                    entry.action === AuditLogEvent.MessagePin || entry.action === AuditLogEvent.MessageUnpin
                );
                if (!channelPinUpdateLog) return;

                const { executor, target, action, extra} = channelPinUpdateLog;

                if (action === AuditLogEvent.MessagePin) {

                    const logEmbed = new EmbedBuilder()
                        .setTitle("PIN CREATE")
                        .setColor(Colors.Red)
                        .setDescription(`User ${executor} has pinned a message in <#${extra.channel.id}>.`)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                    return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                } else {

                    const logEmbed1 = new EmbedBuilder()
                    .setTitle("PIN DELETE")
                    .setColor(Colors.Red)
                    .setDescription(`User ${executor} has removed a pinned message in <#${extra.channel.id}>.`)
                    .setTimestamp()
                    .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed1] })
                }
            }

        })

    },
};