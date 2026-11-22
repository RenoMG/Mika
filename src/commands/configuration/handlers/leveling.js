const { channelIdFrom, loadConfig, setKeyed, setStatus } = require('./configFields');
const { DEFAULT_LEVEL_MESSAGE, isDefaultRequest } = require('../../../utils/formatMessage');

const PLACEHOLDER_HELP = 'Placeholders: {user} is a mention, {userd} is the display name, and {level} is the new level.';

function successReply(reset) {
    if (reset) {
        return `Server config has been updated! Level-up message reset to the default: \`${DEFAULT_LEVEL_MESSAGE}\`. ${PLACEHOLDER_HELP}`;
    }
    return `Server config has been updated! ${PLACEHOLDER_HELP} Set message to default to restore \`${DEFAULT_LEVEL_MESSAGE}\`.`;
}

module.exports = async function leveling(interaction) {
    const levelstatus = interaction.options.getString('status');
    const levelmessage = interaction.options.getString('message');
    const levelchannel = interaction.options.getChannel('channel');

    if (levelstatus == null && levelmessage == null && levelchannel == null) {
        return interaction.reply('Nothing was changed!');
    }

    const reset = isDefaultRequest(levelmessage);
    const data = await loadConfig(interaction.guildId);
    if (levelstatus != null) setStatus(data, 'LevelingCommandStatus', levelstatus);
    if (levelmessage != null) setKeyed(data, 'Levelupmessage', 'Message', reset ? '' : levelmessage);
    const channelId = channelIdFrom(levelchannel);
    if (channelId) setKeyed(data, 'Levelupchannel', 'Channel', channelId);

    await data.save();
    return interaction.reply(successReply(reset));
};
