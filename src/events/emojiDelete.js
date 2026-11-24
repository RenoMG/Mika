const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'emojiDelete', type: AuditLogEvent.EmojiDelete, update: false, fields: ['name'] });
