const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");


module.exports = {
    name: 'emojiUpdate',
    async execute(oldEmoji, newEmoji) {

        configurationDB.findOne({ GuildID: oldEmoji.guild.id }, async (err, data) => {
            if (err) throw err;
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await oldEmoji.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.EmojiUpdate,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor } = channelCreateLog;

                const logEmbed = new EmbedBuilder()
                .setTitle("EMOJI UPDATE")
                .setColor(Colors.Yellow)
                .setDescription(`User ${executor} has updated the emoji ${newEmoji}.\n\n**Original**:\n${oldEmoji.name}\n\n**Updated**:\n${newEmoji.name}`.slice("0", "4096"))
                .setTimestamp()
                .setFooter({ text: 'Rodger | 📑 Logging', iconURL: `${process.env.RODGERICON}` });


                return oldEmoji.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};