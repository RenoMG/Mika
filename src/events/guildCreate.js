const configurationDB = require("../Models/ConfigurationDB");

module.exports = {
    name: 'guildCreate',
    async execute(guild) {

        configurationDB.findOne({ GuildID: guild.id }, async (err, data) => {
            if (err) throw err;
            if (!data) {
                data = new configurationDB({
                    GuildID: guild.id,
                    GreetingChannel: [
                        {
                            Channel: ``
                        }
                    ],
                    FarewellChannel: [
                        {
                            Channel: ``
                        }
                    ],
                    GreetingMessage: [
                        {
                            Message: `Welcome to the server {userd}!`
                        }
                    ],
                    FarewellMessage: [
                        {
                            Message: `Sorry to see you go {userd}!`
                        }
                    ],
                    GreetingStatus: [
                        {
                            Status: `false`
                        }
                    ],
                    FarewellStatus: [
                        {
                            Status: `false`
                        }
                    ],
                    ImageCommandStatus: [
                        {
                            Status: `true`
                        }
                    ],
                    ModerationCommandStatus: [
                        {
                            Status: `true`
                        }
                    ],
                    RedditCommandStatus: [
                        {
                            Status: `true`
                        }
                    ],
                    SocialCommandStatus: [
                        {
                            Status: `true`
                        }
                    ],
                    InfoCommandStatus: [
                        {
                            Status: `true`
                        }
                    ],
                    DisabledChannels: [
                        {
                            Channels: ``
                        }
                    ],
                    LoggingChannel: [
                        {
                            Channel: ``
                        }
                    ],
                    LoggingStatus: [
                        {
                            Status: `false`
                        }
                    ],
                    AutoroleStatus: [
                        {
                            Status: `false`
                        }
                    ],
                    AutoroleRole: [
                        {
                            Role: ``
                        }
                    ],
                    Muterole: [
                        {
                            Role: ``
                        }
                    ]

                })
            }
            data.save()
        });

    },
};