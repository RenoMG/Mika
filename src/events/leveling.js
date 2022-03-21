const Levels = require('discord-xp');

Levels.setURL(`${process.env.RODGERDATABASE}`)

const configurationDB = require("../Models/ConfigurationDB");

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (!message.guild) return;
        if (message.author.bot) return;

        configurationDB.findOne({ GuildID: message.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.LevelingCommandStatus.map((w) => w.Status));
            if (`${status}` === 'true') {
                levelchannelfind = (data.Levelupchannel.map((w) => w.Channel))
                levelmessagefind = (data.Levelupmessage.map((w) => w.Message))

                const randomXp = Math.floor(Math.random() * 9) + 1;
                const hasLeveldUp = await Levels.appendXp(message.author.id, message.guild.id, randomXp);
                if (hasLeveldUp) {
                    const user = await Levels.fetch(message.author.id, message.guild.id)
                    return message.guild.channels.cache.get(`${levelchannelfind}`).send(`${levelmessagefind}`.replace(/{userd}/gi, `${message.author.username}`).replace(/{user}/gi, `<@${message.author.id}>`).replace(/{level}/gi, `${user.level}`))
                }
            }
        })
    },
};