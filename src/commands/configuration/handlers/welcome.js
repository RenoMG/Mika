const { channelIdFrom, loadConfig, setKeyed, setStatus } = require('./configFields');

module.exports = async function welcome(interaction) {
    const gChannel = interaction.options.getChannel('gchannel');
    const fChannel = interaction.options.getChannel('fchannel');
    const greetingO = interaction.options.getString('greeting');
    const farewellO = interaction.options.getString('farewell');
    const gMessage = interaction.options.getString('gmessage');
    const fMessage = interaction.options.getString('fmessage');

    if (gChannel == null && fChannel == null && greetingO == null && farewellO == null && gMessage == null && fMessage == null) {
        return interaction.reply('Nothing was changed!');
    }
    if ((typeof gMessage === 'string' && gMessage.length > 1000) || (typeof fMessage === 'string' && fMessage.length > 1000)) {
        return interaction.reply('That message is too long. Keep it to 1000 characters.');
    }

    const data = await loadConfig(interaction.guildId);
    const greetingChannel = channelIdFrom(gChannel);
    const farewellChannel = channelIdFrom(fChannel);
    if (greetingChannel) setKeyed(data, 'GreetingChannel', 'Channel', greetingChannel);
    if (farewellChannel) setKeyed(data, 'FarewellChannel', 'Channel', farewellChannel);
    if (greetingO != null) setStatus(data, 'GreetingStatus', greetingO);
    if (farewellO != null) setStatus(data, 'FarewellStatus', farewellO);
    if (gMessage != null) setKeyed(data, 'GreetingMessage', 'Message', gMessage);
    if (fMessage != null) setKeyed(data, 'FarewellMessage', 'Message', fMessage);

    await data.save();
    return interaction.reply('Server config has been updated! Placeholders: {user} is a mention and {userd} is the display name.');
};
