const { logChannel, sendLog } = require('../utils/logging');
module.exports = { name: 'channelPinsUpdate', async execute(channel) {
    if (!channel?.guild) return;
    await sendLog(await logChannel(channel.guild), 'CHANNEL PINS UPDATE', `Pins changed in <#${channel.id}>.`);
} };
