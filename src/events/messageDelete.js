const { logChannel, sendLog, text } = require('../utils/logging');
module.exports = { name: 'messageDelete', async execute(message) {
    if (!message?.guild || message.author?.bot) return;

    await sendLog(await logChannel(message.guild), 'MESSAGE DELETE', `By ${message.author || 'Unknown user'} in <#${message.channelId}>\n${text(message.content, 2800)}\n${text([...message.attachments?.values?.() || []].map((a) => a.url).join('\n'), 900)}`);
} };
