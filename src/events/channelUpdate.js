const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'channelUpdate', type: AuditLogEvent.ChannelUpdate, update: true, fields: ['name', 'topic', 'type', 'userLimit', 'bitrate', 'rawPosition', 'rateLimitPerUser', 'nsfw', 'defaultAutoArchiveDuration', 'permissionOverwrites.cache'] });
