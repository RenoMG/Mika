const { Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require("../Models/ConfigurationDB");
const { stripIndents } = require("common-tags");

module.exports = {
    name: 'messageUpdate',
    async execute(oldMessage, newMessage) {

        configurationDB.findOne({ GuildID: newMessage.guild.id }, async (err, data) => {
            if (err) throw err;
            if (oldMessage.author.bot) return;
            if (oldMessage.content === newMessage.content) return;
            const count = 1950;
            const original = oldMessage.content.slice(0, count) + (oldMessage.content.length > count ? "..." : "")
            const edited = newMessage.content.slice(0, count) + (oldMessage.content.length > count ? "..." : "")
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new EmbedBuilder()
                .setTitle("MESSAGE UPDATE")
                .setColor(Colors.Yellow)
                .setDescription(`[Message](${newMessage.url}) by ${newMessage.author} was updated in ${newMessage.channel}.\n\n**Original**:\n${original}\n\n**Updated**:\n${edited}`.slice("0", "4096"))
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                return newMessage.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

    },
};