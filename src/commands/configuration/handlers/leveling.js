const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function leveling(interaction) {
    const levelstatus = interaction.options.getString("status");
    const levelmessage = interaction.options.getString("message");
    const levelchannel = interaction.options.getChannel("channel");

if (levelstatus === null && levelmessage === null && levelchannel === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        stripChannel1 = levelchannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
        if (!data) {
            data = new configurationDB({
                GuildID: interaction.guildId,
                LevelingCommandStatus: [
                    {
                        Status: levelstatus
                    }
                ],
                Levelupmessage: [
                    {
                        Message: levelmessage
                    }
                ],
                Levelupchannel: [
                    {
                        Channel: stripChannel1
                    }
                ]
            })
        } else {
            if (levelstatus === null) {

            } else {
                data.LevelingCommandStatus.splice(0, 1)
                const obj = {
                    Status: levelstatus
                }
                data.LevelingCommandStatus.push(obj)
            }
            if (levelmessage === null) {

            } else {
                data.Levelupmessage.splice(0, 1)
                const obj = {
                    Message: levelmessage
                }
                data.Levelupmessage.push(obj)
            }
            if (levelchannel === null) {

            } else {
                stripChannel1 = levelchannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                data.Levelupchannel.splice(0, 1)
                const obj = {
                    Channel: stripChannel1
                }
                data.Levelupchannel.push(obj)
            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });
}
};
