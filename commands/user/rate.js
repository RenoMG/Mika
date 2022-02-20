const { getMember, formatDate } = require("../../functions.js");
const { MessageEmbed } = require("discord.js");
const { stripIndents } = require("common-tags");
const randomPuppy = require("random-puppy");

module.exports = {
  name: "rate",
  category: "user",
  description: "Rates mentioned user.",
  run: async (client, message, args, user) => {

    const member = getMember(message, args.join(" "));

    // Member variables
    const joined = formatDate(member.joinedAt);
    const roles = member.roles
      .cache.filter(r => r.id !== message.guild.id)
      .map(r => r)
      .join(", ") || "none";

    // User variables
    const created = formatDate(member.user.createdAt);

    const toRate = message.mentions.members.first() || message.guild.members.get(args[0]);

    let ratus = message.mentions.members.first();
    if (!ratus) return message.reply("You need to tag someone to rate them!");

    let rates = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

    let result = Math.floor((Math.random() * rates.length));

    const embed = new MessageEmbed()
      .setColor("RANDOM")
      .setThumbnail(member.user.displayAvatarURL)
      .setTimestamp()
      .setDescription(stripIndents`**RATE**

                I have finished rating ${member}, the results are in!`)
      .addField(`**${member.displayName}**`, stripIndents`I rate you **${result}/10**!`, false)
      .setFooter('Rodger | 👽 RATE!', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");
    message.channel.send(embed);

  }
}
