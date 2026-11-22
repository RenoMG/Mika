const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'emojiDelete',
    async execute(emoji) {

        configurationDB.findOne({ GuildID: emoji.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await emoji.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.EmojiDelete,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor } = channelCreateLog;

                const logEmbed = new EmbedBuilder()
                .setTitle("EMOJI DELETE")
                .setColor(Colors.Red)
                .setDescription(`User ${executor} has removed the emoji ${emoji.name}.`)
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return emoji.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};