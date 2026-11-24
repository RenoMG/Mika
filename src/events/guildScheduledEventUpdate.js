const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'guildScheduledEventUpdate', type: AuditLogEvent.GuildScheduledEventUpdate, update: true, fields: ['name', 'description', 'status', 'scheduledStartTimestamp', 'scheduledEndTimestamp', 'channelId'] });
