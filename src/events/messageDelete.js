const { logChannel, sendLog, text } = require('../utils/logging');
const { COLORS } = require('../utils/style');
module.exports = { name: 'messageDelete', async execute(message) {
    if (!message?.guild || message.author?.bot) return;
    const files = [...message.attachments?.values?.() || []].map((a) => a.url);
    const lines = [`**By:** ${message.author || 'Unknown user'} · **In:** <#${message.channelId}>`, ''];
    lines.push(message.content ? text(message.content, 2800) : '*No text content*');
    if (files.length) lines.push('', `**Attachments:**\n${text(files.join('\n'), 900)}`);
    await sendLog(await logChannel(message.guild), '🗑️ Message deleted', lines.join('\n'), COLORS.danger);
} };
