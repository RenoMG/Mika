const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../utils/getGuildConfig");
const { DEFAULT_FAREWELL_MESSAGE, formatMessage, memberValues, storedMessage } = require("../utils/formatMessage");
const { allowedMentions } = require("../utils/mentions");

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, guild) {

        const farewell = getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.FarewellStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                const farewellchannelfind = (data.FarewellChannel.map((w) => w.Channel))
                const farewellmessagecontent = storedMessage(data.FarewellMessage, DEFAULT_FAREWELL_MESSAGE)

                const text = formatMessage(farewellmessagecontent, memberValues(member));
                return member.guild.channels.cache.get(`${farewellchannelfind}`).send({
                    content: text,
                    allowedMentions: allowedMentions(member.user && member.user.id),
                })
            }

        })

        const logging = getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new EmbedBuilder()
                .setTitle("USER LEAVE")
                .setThumbnail(member.displayAvatarURL())
                .setColor(Colors.Red)
                .addFields({ name: '**~** Account information', value: stripIndents`• ID: ${member.user.id}
              • Username: ${member.user.username}
              • Discord Tag: ${member.user.tag}
              • Created at: ${member.user.createdAt.toLocaleString()}`, inline: false })
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                return member.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

        await Promise.all([farewell, logging]);
    },
};