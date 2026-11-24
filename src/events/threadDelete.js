const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'threadDelete', type: AuditLogEvent.ThreadDelete, update: false, fields: ['name', 'archived', 'locked', 'rateLimitPerUser', 'autoArchiveDuration'] });
