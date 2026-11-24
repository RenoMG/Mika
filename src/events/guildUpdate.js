const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'guildUpdate', type: AuditLogEvent.GuildUpdate, update: true, fields: ['name', 'description', 'icon', 'ownerId', 'verificationLevel'] });
