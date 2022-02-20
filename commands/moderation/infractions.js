const {
  getMember,
  formatDate
} = require("../../functions.js");
const {
  MessageEmbed
} = require("discord.js");
const {
  stripIndents
} = require("common-tags");
const Keyv = require('keyv');

const warncount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'warncount' });
const kickcount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'kickcount' });
const bancount = new Keyv(`${process.env.SERVERSTATSKEYV}`, { namespace: 'bancount' });

module.exports = {
  name: "infractions",
  aliases: ["infraction", "warns", "bans", "kicks"],
  category: "moderation",
  description: "Gets list of users infractions",
  usage: "[username | id, | mention]",
  run: async (client, message, args) => {

    try {

      const member = getMember(message, args.join(" "));
      const clearArray = message.content.split(" ");
      const clearArgs = clearArray.slice(1);

      //Member variables
      const joined = formatDate(member.joinedAt);
      const roles = member.roles
        .cache.filter(r => r.id !== message.guild.id)
        .map(r => r)
        .join(", ") || "none";

      //User variables
      const created = formatDate(member.user.createdAt);

      warncount0 = (`${await warncount.get(member.user.id + message.guild.id)}`);
      var warncount1 = warncount0.replace("undefined", "0");
      kickcount0 = (`${await kickcount.get(member.user.id + message.guild.id)}`);
      var kickcount1 = kickcount0.replace("undefined", "0");
      bancount0 = (`${await bancount.get(member.user.id + message.guild.id)}`);
      var bancount1 = bancount0.replace("undefined", "0");

      add0 = (`${warncount1}`);
      add1 = (`${kickcount1}`);
      add2 = (`${bancount1}`);
      var letsadd = +add0 + +add1 + +add2;

      if (clearArgs[0] === 'clear') {
        // No author permissions
        if (!message.member.hasPermission("KICK_MEMBERS"))
          return message.reply("You need to have the `KICK_MEMBERS` permission to clear infractions!");



        bancountclear = (`${await bancount.clear(member.user.id + message.guild.id)}`);
        kickcountclear = (`${await kickcount.clear(member.user.id + message.guild.id)}`);
        warncountclear = (`${await warncount.clear(member.user.id + message.guild.id)}`);
        return message.reply("All infractions have been cleared!");

      };




      const embed = new MessageEmbed()
        .setColor(member.displayHexColor)
        .setAuthor(`Infractions for ${member.user.tag}`, `${member.user.displayAvatarURL()}`)

        .addField(`Total Infractions: ${letsadd}`, stripIndents`**~ Warns:** ${warncount1}
            **~ Kicks:** ${kickcount1}
            **~ Bans:** ${bancount1}`, true)

        .setTimestamp()

      message.channel.send(embed);
    } catch (err) {
      console.log(err)
    }
  }

}
