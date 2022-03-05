const configurationDB = require("../Models/ConfigurationDB");

module.exports = {
    name: 'guildCreate',
    async execute(guild) {

        configurationDB.findOne({ GuildID: guild.id }, async (err, data) => {
            if (err) throw err;
            if (!data) {
                data = new configurationDB({
                    GuildID: guild.id,
                    GreetingMessage: [
                        {
                            Message: `Welcome to the server {member}!`
                        }
                    ],
                    FarewellMessage: [
                        {
                            Message: `Sorry to see you go {member}!`
                        }
                    ],
                })
            } else {
                data.GreetingMessage.splice(0, 1)
                const obj = {
                    Message: `Welcome to the server {member}!`
                }
                data.GreetingMessage.push(obj)
                data.Farewell.splice(0, 1)
                const obj1 = {
                    Message: `Sorry to see you go {member}!`
                }
                data.FarewellMessage.push(obj1)
            }
            data.save()
        });

            console.log(`guild joined`, guild.id)

    },
};