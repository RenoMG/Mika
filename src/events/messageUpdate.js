const { logChannel, sendLog, text } = require('../utils/logging');
module.exports = { name: 'messageUpdate', async execute(before, message) {
    if (!message?.guild || message.author?.bot) return;
    if (before?.content === message.content) return;
    await sendLog(await logChannel(message.guild), 'MESSAGE UPDATE', `[Message](${message.url}) by ${message.author || 'Unknown user'} in <#${message.channelId}>\n**Original:** ${text(before?.content, 1800)}\n**Updated:** ${text(message.content, 1800)}`);
} };
