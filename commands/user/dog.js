const { MessageEmbed } = require("discord.js");
const Discord = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fs = require('fs');
const fetch = require('node-fetch');
const request = require('node-superfetch');
const DOG_API_KEY = "***REMOVED***";

module.exports = {
  name: "dog",
  category: "user",
  aliases: ["doggo"],
  description: "Sends random image of a dog",
  run: async (client, message, args, err, file) => {

    try {

      const { body } = await request.get('https://dog.ceo/api/breeds/image/random');


      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("DOG")
        .setImage(`${body.message}`)
        .setFooter("Rodger | 🐶 Random Dog", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
        .setTimestamp()
      message.channel.send(embed);

    }
    catch (err) { console.log(err) }
  }
};
