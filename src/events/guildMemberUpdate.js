const { eventLogger } = require('../utils/logging');
module.exports = eventLogger({ name: 'guildMemberUpdate', update: true, fields: ['nickname', 'user.username', 'avatar'] });
