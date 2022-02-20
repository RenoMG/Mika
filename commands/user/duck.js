const { MessageEmbed } = require("discord.js");
const Discord = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fs = require('fs');
const fetch = require('node-fetch');

module.exports = {
  name: "duck",
  category: "user",
  aliases: [],
  description: "Sends random image of a duck",
  run: async (client, message, args, err, file) => {

    try {

      const { url } = await fetch('https://random-d.uk/api/v2/random?format=json').then(response => response.json());



      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("DUCK")
        .setImage(`${url}`)
        .setFooter("Rodger | 🦆 Random Duck", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
        .setTimestamp()
      message.channel.send(embed);

    }
    catch (err) { return; }
  }
};
