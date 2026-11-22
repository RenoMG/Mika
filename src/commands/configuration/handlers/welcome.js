const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function welcome(interaction) {
    const gChannel = interaction.options.getChannel("gchannel");
    const fChannel = interaction.options.getChannel("fchannel");
    const greetingO = interaction.options.getString("greeting");
    const farewellO = interaction.options.getString("farewell");
    const gMessage = interaction.options.getString("gmessage");
    const fMessage = interaction.options.getString("fmessage");

if (gChannel === null && fChannel === null && greetingO === null && farewellO === null && gMessage === null && fMessage === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        if (!data) {
            stripChannel1 = gChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
            stripChannel2 = fChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
            data = new configurationDB({
                GuildID: interaction.guildId,
                GreetingChannel: [
                    {
                        Channel: stripChannel1
                    }
                ],
                FarewellChannel: [
                    {
                        Channel: stripChannel2
                    }
                ],
                GreetingMessage: [
                    {
                        Message: gMessage
                    }
                ],
                FarewellMessage: [
                    {
                        Message: fMessage
                    }
                ],
                GreetingStatus: [
                    {
                        Status: greetingO
                    }
                ],
                FarewellStatus: [
                    {
                        Status: farewellO
                    }
                ],
            })
        } else {
            if (gChannel === null) {

            } else {
                stripChannel1 = gChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                data.GreetingChannel.splice(0, 1)
                const obj = {
                    Channel: stripChannel1
                }
                data.GreetingChannel.push(obj)
            }

            if (fChannel === null) {

            } else {
                stripChannel2 = fChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                data.FarewellChannel.splice(0, 1)
                const obj = {
                    Channel: stripChannel2
                }
                data.FarewellChannel.push(obj)
            }

            if (greetingO === null) {

            } else {
                data.GreetingStatus.splice(0, 1)
                const obj = {
                    Status: greetingO
                }
                data.GreetingStatus.push(obj)
            }

            if (farewellO === null) {

            } else {
                data.FarewellStatus.splice(0, 1)
                const obj = {
                    Status: farewellO
                }
                data.FarewellStatus.push(obj)
            }

            if (gMessage === null) {

            } else {
                data.GreetingMessage.splice(0, 1)
                const obj = {
                    Message: gMessage
                }
                data.GreetingMessage.push(obj)
            }

            if (fMessage === null) {

            } else {
                data.FarewellMessage.splice(0, 1)
                const obj = {
                    Message: fMessage
                }
                data.FarewellMessage.push(obj)
            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });
}
};
