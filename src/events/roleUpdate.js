const { AuditLogEvent } = require('discord.js');
const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'roleUpdate', type: AuditLogEvent.RoleUpdate, update: true, fields: ['name', 'color', 'position', 'hoist', 'mentionable', 'permissions.bitfield'] });
