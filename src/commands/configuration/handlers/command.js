const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function command(interaction) {
    const moderation = interaction.options.getString("moderation");
    const meme = interaction.options.getString("meme");
    const information = interaction.options.getString("information");
    const social = interaction.options.getString("social");
    const image = interaction.options.getString("image");
    const rchannel = interaction.options.getChannel("rchannel");
    const achannel = interaction.options.getChannel("achannel");

if (moderation === null && meme === null && information === null && social === null && image === null && rchannel === null && achannel === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        if (!data) {
            data = new configurationDB({
                GuildID: interaction.guildId,
                ImageCommandStatus: [
                    {
                        Status: image
                    }
                ],
                ModerationCommandStatus: [
                    {
                        Status: moderation
                    }
                ],
                MemeCommandStatus: [
                    {
                        Status: meme
                    }
                ],
                SocialCommandStatus: [
                    {
                        Status: social
                    }
                ],
                InfoCommandStatus: [
                    {
                        Status: information
                    }
                ],
                DisabledChannels: [
                    {
                        Channels: achannel.id
                    }
                ]
            })
        } else {
            if (image === null) {

            } else {
                data.ImageCommandStatus.splice(0, 1)
                const obj = {
                    Status: image
                }
                data.ImageCommandStatus.push(obj)
            }

            if (moderation === null) {

            } else {
                data.ModerationCommandStatus.splice(0, 1)
                const obj = {
                    Status: moderation
                }
                data.ModerationCommandStatus.push(obj)
            }

            if (meme === null) {

            } else {
                data.MemeCommandStatus.splice(0, 1)
                const obj = {
                    Status: meme
                }
                data.MemeCommandStatus.push(obj)
            }

            if (social === null) {

            } else {
                data.SocialCommandStatus.splice(0, 1)
                const obj = {
                    Status: social
                }
                data.SocialCommandStatus.push(obj)
            }

            if (information === null) {

            } else {
                data.InfoCommandStatus.splice(0, 1)
                const obj = {
                    Status: information
                }
                data.InfoCommandStatus.push(obj)
            }

            if (achannel === null) {

            } else {
                const obj = {
                    Channels: achannel.id
                }
                data.DisabledChannels.push(obj)
            }

            if (rchannel === null) {

            } else {

                data.DisabledChannels.pull({ Channels: rchannel.id })

            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });

}
};
