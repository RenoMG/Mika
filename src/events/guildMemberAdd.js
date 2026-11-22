const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../utils/getGuildConfig");
const { DEFAULT_GREETING_MESSAGE, formatMessage, memberValues, storedMessage } = require("../utils/formatMessage");

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, guild) {

        const greeting = getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.GreetingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                const greetingchannelfind = (data.GreetingChannel.map((w) => w.Channel))
                const greetingmessagecontent = storedMessage(data.GreetingMessage, DEFAULT_GREETING_MESSAGE)

                return member.guild.channels.cache.get(`${greetingchannelfind}`).send(formatMessage(greetingmessagecontent, memberValues(member)))
            }

        })

        const autorole = getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.AutoroleStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                getrole = (data.AutoroleRole.map((w) => w.Role))

                return member.roles.add(getrole);
            }

        })

        const logging = getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.LoggingStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                const logEmbed = new EmbedBuilder()
                .setTitle("USER JOIN")
                .setThumbnail(member.displayAvatarURL())
                .setColor(Colors.Green)
                .addFields({ name: '**~** Account information', value: stripIndents`• ID: ${member.user.id}
              • Username: ${member.user.username}
              • Discord Tag: ${member.user.tag}
              • Created at: ${member.user.createdAt.toLocaleString()}`, inline: false })
                .setTimestamp()
                .setFooter({ text: 'Mika | 📑 Logging', iconURL: `${process.env.MIKAICON}` });

                return member.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
            }

        })

        await Promise.all([greeting, autorole, logging]);
    },
};