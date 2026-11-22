const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'channelDelete',
    async execute(channel) {

        configurationDB.findOne({ GuildID: channel.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await channel.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.ChannelDelete,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor, target} = channelCreateLog;

                const logEmbed = new EmbedBuilder()
                .setTitle("CHANNEL DELETE")
                .setColor(Colors.Red)
                .setDescription(`User ${executor} has deleted the channel **${target.name}**.`)
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};