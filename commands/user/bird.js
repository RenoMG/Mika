const { MessageEmbed } = require("discord.js");
const Discord = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fs = require('fs');
const fetch = require('node-fetch');
const shibeURL = `http://shibe.online/api/birds?count=1&urls=true&httpsUrls=true`;

module.exports = {
    name: "bird",
    category: "user",
    aliases: [],
    description: "Sends random image of a bird",
    run: async (client, message, args, err, file) => {

        try {
            new Promise((fulfill, reject) => {
                getPic(shibeURL).then((res) => {
                    if (res != ``) {
                        fulfill(({ file: res }));


                        const embed = new MessageEmbed()
                            .setColor("RANDOM")
                            .setTitle("BIRD")
                            .setImage(`${res}`)
                            .setFooter("Rodger | 🐥 Random Bird", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
                            .setTimestamp()
                        message.channel.send(embed);

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
