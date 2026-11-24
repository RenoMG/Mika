const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'guildScheduledEventDelete', type: AuditLogEvent.GuildScheduledEventDelete, update: false, fields: ['name', 'description', 'status', 'scheduledStartTimestamp', 'scheduledEndTimestamp', 'channelId'] });
