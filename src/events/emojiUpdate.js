const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'emojiUpdate', type: AuditLogEvent.EmojiUpdate, update: true, fields: ['name'] });
