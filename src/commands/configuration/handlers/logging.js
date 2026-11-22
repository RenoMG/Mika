const { channelIdFrom, loadConfig, setKeyed, setStatus } = require('./configFields');

module.exports = async function logging(interaction) {
    const logstatus = interaction.options.getString('status');
    const logchannel = interaction.options.getChannel('channel');

    if (logchannel == null && logstatus == null) {
        return interaction.reply('Nothing was changed!');
    }

    const data = await loadConfig(interaction.guildId);
    const channelId = channelIdFrom(logchannel);
    if (channelId) setKeyed(data, 'LoggingChannel', 'Channel', channelId);
    if (logstatus != null) setStatus(data, 'LoggingStatus', logstatus);

    await data.save();
    return interaction.reply('Server config has been updated!');
};
