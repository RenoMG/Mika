const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function logging(interaction) {
    const logstatus = interaction.options.getString("status");
    const logchannel = interaction.options.getChannel("channel");

if (logchannel === null && logstatus === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        if (!data) {
            data = new configurationDB({
                GuildID: interaction.guildId,
                LoggingChannel: [
                    {
                        Channel: logchannel.id
                    }
                ],
                LoggingStatus: [
                    {
                        Status: logstatus
                    }
                ],
            })
        } else {
            if (logchannel === null) {

            } else {
                data.LoggingChannel.splice(0, 1)
                const obj = {
                    Channel: logchannel.id
                }
                data.LoggingChannel.push(obj)
            }

            if (logstatus === null) {

            } else {
                data.LoggingStatus.splice(0, 1)
                const obj = {
                    Status: logstatus
                }
                data.LoggingStatus.push(obj)
            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });

}
};
