const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'threadCreate', type: AuditLogEvent.ThreadCreate, update: false, fields: ['name', 'archived', 'locked', 'rateLimitPerUser', 'autoArchiveDuration'] });
