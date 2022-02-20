const { MessageEmbed } = require("discord.js");
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fetch = require('node-fetch');
const catURL = `http://shibe.online/api/cats?count=1&urls=true&httpsUrls=true`;

module.exports = {
    name: "cat",
    category: "user",
    description: "Sends random cat image",
    run: async (client, message, args) => {

        try {

            new Promise((fulfill, reject) => {
                getPic(catURL).then((res) => {
                    if (res != ``) {
                        fulfill(({ file: res }));


                        const embed = new MessageEmbed()
                            .setColor("RANDOM")
                            .setTitle("CAT")
                            .setImage(`${res}`)
                            .setFooter("Rodger | 🐈 Random cat", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
                            .setTimestamp()
                        message.channel.send(embed)

                    };
                });
            });


        } catch (err) {
            return console.log(err);
        }

        function getPic(url) {
            return new Promise((fulfill, reject) => {
                fetch(url).then(res => res.json()).then((out) => {
                    fulfill(out[0]);
                }).catch(err => { reject(err) });
            });
        };
    }
}
