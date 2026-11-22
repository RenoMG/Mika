const { getGuildConfig } = require('../utils/getGuildConfig');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        await getGuildConfig(guild.id);
    },
};
