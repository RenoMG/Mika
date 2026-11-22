const Levels = require('../levels');
const { getGuildConfig } = require("../utils/getGuildConfig");

Levels.setURL(`${process.env.MIKADATABASE}`)


module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild) return;
        if (message.author.bot) return;

        getGuildConfig(message.guild.id).then(async (data) => {
            const status = (data.LevelingCommandStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                levelchannelfind = (data.Levelupchannel.map((w) => w.Channel))
                levelmessagefind = (data.Levelupmessage.map((w) => w.Message))

                const randomXp = Math.floor(Math.random() * 9) + 1;
                const hasLeveldUp = await Levels.appendXp(message.author.id, message.guild.id, randomXp);
                if (hasLeveldUp) {
                    const user = await Levels.fetch(message.author.id, message.guild.id)
                    if (!user) return;
                    return message.guild.channels.cache.get(`${levelchannelfind}`).send(`${levelmessagefind}`.replace(/{userd}/gi, `${message.author.username}`).replace(/{user}/gi, `<@${message.author.id}>`).replace(/{level}/gi, `${user.level}`))
                }
            }
        })
    },
};