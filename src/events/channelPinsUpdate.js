const { logChannel, sendLog } = require('../utils/logging');
module.exports = { name: 'channelPinsUpdate', async execute(channel) {
    if (!channel?.guild) return;
    await sendLog(await logChannel(channel.guild), '📌 Pins updated', `Pinned messages changed in <#${channel.id}>.`);
} };
