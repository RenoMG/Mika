const Discord = require('discord.js');
const randomPuppy = require("random-puppy");
const snekfetch = require('snekfetch');
const fs = require('fs');
const fetch = require('node-fetch');

module.exports = {
  name: "fact",
  category: "user",
  aliases: [],
  description: "Sends random fact",
  run: async (client, message, args, err, file) => {

    try {

      const { text } = await fetch('https://uselessfacts.jsph.pl/random.json?language=en').then(response => response.json());

      message.channel.send(text);

    }
    catch (err) { return; }
  }
};
