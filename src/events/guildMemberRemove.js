const { Colors, EmbedBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const { getGuildConfig } = require("../utils/getGuildConfig");

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, guild) {
            
        getGuildConfig(member.guild.id).then(async (data) => {
            const status =  (data.FarewellStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                farewellchannelfind = (data.FarewellChannel.map((w) => w.Channel))
                farewellmessagecontent = (data.FarewellMessage.map((w) => w.Message))

                return member.guild.channels.cache.get(`${farewellchannelfind}`).send(`${farewellmessagecontent}`.replace(/{userd}/gi, `${member.displayName}`.replace(/{user}/gi, `<@${member.user.id}>`)))
            }

        })

        getGuildConfig(member.guild.id).then(async (data) => {
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

    },
};