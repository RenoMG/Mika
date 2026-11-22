const { channelIdFrom, loadConfig, pullKeyed, pushKeyed, setStatus } = require('./configFields');

module.exports = async function command(interaction) {
    const moderation = interaction.options.getString('moderation');
    const meme = interaction.options.getString('meme');
    const information = interaction.options.getString('information');
    const social = interaction.options.getString('social');
    const image = interaction.options.getString('image');
    const rchannel = interaction.options.getChannel('rchannel');
    const achannel = interaction.options.getChannel('achannel');

    if (moderation == null && meme == null && information == null && social == null && image == null && rchannel == null && achannel == null) {
        return interaction.reply('Nothing was changed!');
    }

    const data = await loadConfig(interaction.guildId);
    if (image != null) setStatus(data, 'ImageCommandStatus', image);
    if (moderation != null) setStatus(data, 'ModerationCommandStatus', moderation);
    if (meme != null) setStatus(data, 'MemeCommandStatus', meme);
    if (social != null) setStatus(data, 'SocialCommandStatus', social);
    if (information != null) setStatus(data, 'InfoCommandStatus', information);

    const addId = channelIdFrom(achannel);
    if (addId) pushKeyed(data, 'DisabledChannels', 'Channels', addId);
    const removeId = channelIdFrom(rchannel);
    if (removeId) pullKeyed(data, 'DisabledChannels', 'Channels', removeId);

    await data.save();
    return interaction.reply('Server config has been updated!');
};
