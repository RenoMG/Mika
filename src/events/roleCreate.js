const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'roleCreate', type: AuditLogEvent.RoleCreate, update: false, fields: ['name', 'color', 'position', 'hoist', 'mentionable', 'permissions.bitfield'] });
