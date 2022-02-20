const { MessageEmbed } = require("discord.js");
const Discord = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fs = require('fs');
const fetch = require('node-fetch');

module.exports = {
  name: "fox",
  category: "user",
  aliases: [],
  description: "Sends random image of a fox",
  run: async (client, message, args, err, file) => {

    try {

      const { image } = await fetch('https://randomfox.ca/floof/').then(response => response.json());



      const embed = new MessageEmbed()
        .setColor("RANDOM")
        .setTitle("FOX")
        .setImage(`${image}`)
        .setFooter("Rodger | 🦊 Random Fox", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
        .setTimestamp()
      message.channel.send(embed);

    }
    catch (err) { return; }
  }
};
