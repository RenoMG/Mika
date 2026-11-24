const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'guildScheduledEventCreate', type: AuditLogEvent.GuildScheduledEventCreate, update: false, fields: ['name', 'description', 'status', 'scheduledStartTimestamp', 'scheduledEndTimestamp', 'channelId'] });
