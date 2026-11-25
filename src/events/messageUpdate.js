const { logChannel, sendLog, text } = require('../utils/logging');
module.exports = { name: 'messageUpdate', async execute(before, message) {
    if (!message?.guild || message.author?.bot) return;
    if (before?.content === message.content) return;
    const old = before?.content ? text(before.content, 1800) : '*Not cached*';
    const now = message.content ? text(message.content, 1800) : '*No text content*';
    await sendLog(await logChannel(message.guild), '✏️ Message edited', `**By:** ${message.author || 'Unknown user'} · **In:** <#${message.channelId}> · [Jump to message](${message.url})\n\n**Before:**\n${old}\n\n**After:**\n${now}`);
} };
