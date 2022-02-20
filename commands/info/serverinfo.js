const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const moment = require("moment");
require("moment-duration-format");

module.exports = {
  name: "serverinfo",
  aliases: ["sinfo", "servstats", "server"],
  category: "info",
  description: "Gives stats on current server.",
  run: async (client, message, args, user) => {

    boostcheck = (`${message.guild.premiumSubscriptionCount}`);
    boostcount = boostcheck.replace("undefined", "0");

    var imagedata = (`${message.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
    var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");

    function formatNumber(num) {
      return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
    }

    const embed = new MessageEmbed()
      .setTitle("SERVER INFO")
      .setColor("RANDOM")
      .setThumbnail(`${res}`)
      .addField(`**~** General Info`,
        stripIndents`
      • Owner: ${message.guild.owner.user.username}#${message.guild.owner.user.discriminator}
      • Name: ${message.guild.name}
      • ID: ${message.guild.id}
      • Region: ${message.guild.region}
      • Creation date: ${message.guild.createdAt}
      • Members: ${formatNumber(message.guild.memberCount)}
      • Roles: ${message.guild.roles.cache.size}
      • Verification level: ${message.guild.verificationLevel}
      • Boosts: ${boostcount}
      • Emojis: ${message.guild.emojis.cache.size}`, false)
      .addField(`**~** Channels:`,
        stripIndents`
      • Text: ${message.guild.channels.cache.filter(m => m.type === 'text').size}
      • Voice: ${message.guild.channels.cache.filter(m => m.type === 'voice').size}`, false)
      .setFooter("Rodger | 📋 Server info", "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png")
      .setTimestamp()

    message.channel.send(embed);

  }
}
