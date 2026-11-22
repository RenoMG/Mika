const { channelIdFrom, loadConfig, setKeyed, setStatus } = require('./configFields');

module.exports = async function leveling(interaction) {
    const levelstatus = interaction.options.getString('status');
    const levelmessage = interaction.options.getString('message');
    const levelchannel = interaction.options.getChannel('channel');

    if (levelstatus == null && levelmessage == null && levelchannel == null) {
        return interaction.reply('Nothing was changed!');
    }

    const data = await loadConfig(interaction.guildId);
    if (levelstatus != null) setStatus(data, 'LevelingCommandStatus', levelstatus);
    if (levelmessage != null) setKeyed(data, 'Levelupmessage', 'Message', levelmessage);
    const channelId = channelIdFrom(levelchannel);
    if (channelId) setKeyed(data, 'Levelupchannel', 'Channel', channelId);

    await data.save();
    return interaction.reply('Server config has been updated!');
};
