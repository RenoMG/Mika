const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'threadUpdate', type: AuditLogEvent.ThreadUpdate, update: true, fields: ['name', 'archived', 'locked', 'rateLimitPerUser', 'autoArchiveDuration'] });
