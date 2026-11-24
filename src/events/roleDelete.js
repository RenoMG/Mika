const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'roleDelete', type: AuditLogEvent.RoleDelete, update: false, fields: ['name', 'color', 'position', 'hoist', 'mentionable', 'permissions.bitfield'] });
