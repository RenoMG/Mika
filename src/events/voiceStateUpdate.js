const { logChannel, sendLog } = require('../utils/logging');
const { COLORS } = require('../utils/style');
module.exports = { name: 'voiceStateUpdate', async execute(before, after) {
    if (!after?.guild || before.channelId === after.channelId) return;
    const title = !before.channelId ? '🔊 Joined voice' : (!after.channelId ? '🔇 Left voice' : '🔀 Moved voice channel');
    const color = !before.channelId ? COLORS.success : (!after.channelId ? COLORS.danger : COLORS.warning);
    const path = `${before.channelId ? `<#${before.channelId}>` : 'Not connected'} → ${after.channelId ? `<#${after.channelId}>` : 'Disconnected'}`;
    await sendLog(await logChannel(after.guild), title, `<@${after.id}>\n${path}`, color);
} };
