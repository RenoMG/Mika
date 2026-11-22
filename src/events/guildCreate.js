const { getGuildConfig } = require('../functions/getGuildConfig');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        await getGuildConfig(guild.id);
    },
};
