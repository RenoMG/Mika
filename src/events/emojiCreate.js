const { AuditLogEvent, Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../functions/getGuildConfig");


module.exports = {
    name: 'emojiCreate',
    async execute(emoji) {

        getGuildConfig(emoji.guild.id).then(async (data) => {
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const fetchedLogs = await emoji.guild.fetchAuditLogs({
                    limit: 1,
                    type: AuditLogEvent.EmojiCreate,
                });

                const channelCreateLog = fetchedLogs.entries.first();

                const { executor } = channelCreateLog;

                const logEmbed = new EmbedBuilder()
                .setTitle("EMOJI CREATE")
                .setColor(Colors.Yellow)
                .setDescription(`User ${executor} has added the emoji ${emoji}.`)
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });


                return emoji.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};