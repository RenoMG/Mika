const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'channelDelete', type: AuditLogEvent.ChannelDelete, update: false, fields: ['name', 'topic', 'type', 'userLimit', 'bitrate', 'rawPosition', 'rateLimitPerUser', 'nsfw', 'defaultAutoArchiveDuration', 'permissionOverwrites.cache'] });
