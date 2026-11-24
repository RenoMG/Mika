const { logChannel, sendLog } = require('../utils/logging');
module.exports = { name: 'voiceStateUpdate', async execute(before, after) {
    if (!after?.guild || before.channelId === after.channelId) return;
    await sendLog(await logChannel(after.guild), 'VOICE UPDATE', `<@${after.id}>: ${before.channelId ? `<#${before.channelId}>` : 'Disconnected'} → ${after.channelId ? `<#${after.channelId}>` : 'Disconnected'}`);
} };
