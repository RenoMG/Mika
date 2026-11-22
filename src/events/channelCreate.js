const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'channelCreate',
    async execute(channel) {

        configurationDB.findOne({ GuildID: channel.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await channel.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.ChannelCreate,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor } = channelCreateLog;

                const logEmbed = new EmbedBuilder()
                .setTitle("CHANNEL CREATE")
                .setColor(Colors.Yellow)
                .setDescription(`User ${executor} has created the channel ${channel}.`)
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return channel.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};