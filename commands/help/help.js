const {
  getMember,
  formatDate
} = require("../../functions.js");
const {
  MessageEmbed
} = require("discord.js");
const Keyv = require('keyv');

const globalPrefix = '.';
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });

module.exports = {
  name: "help",
  aliases: ["h", "info"],
  category: "help",
  description: "Gives info on commands.",
  run: async (client, message, args, user) => {

    const member = getMember(message, args.join(" "));

    const info = new MessageEmbed()
      .setColor("RANDOM")
      .setAuthor(`Rodger help menu! `, `https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png`)
      .setDescription(`• Rodger server invite link: [Invite](https://discord.gg/bMDsSsP6w3)\n• Rodger invite link: [Invite](https://discordapp.com/api/oauth2/authorize?client_id=664244372723728424&permissions=8&scope=bot)\n• Rodger default prefix: \`.\`\n• Prefix for ${message.guild.name} is \`${await prefixes.get(message.guild.id) || globalPrefix}\``, '‏‏‎ ‎', false)
      .addField('‏‏‎‏‏‎**🔧 CONFIG COMMANDS**‎', 'enable **-** disable **-** prefix **-** logging **-** greeting **-** farewell', false)
      .addField('‏‏‎**📡 INFO COMMANDS**', 'alive **-** alivetime **-** help **-** vote **-** members **-** stats **-** serverinfo **-** uinfo **-** avatar **-** invite', false)
      .addField('‏‏‎‏‏‎**🚓 MODERATION COMMANDS**‎', 'ban **-** unban **-** hackban **-** kick **-** warn **-** mute **-** infractions **-** unmute **-** clear **-** hammertime', false)
      .addField('‏‏‎‏‏‎**🎶 MUSIC COMMANDS**‎', 'play **-** queue **-** lyrics **-** np **-** remove **-** shuffle **-** skip **-** stop', false)
      .addField('‏‏‎**🎉 FUN COMMANDS**‎', 'art **-** wallpaper **-** meme **-** hack **-** fbi **-** kill **-** cookie **-** cat **-** shibe **-** dog **-** bird **-** fox **-** duck **-** fact **-** rate **-** dab **-** highfive **-** hug **-** cuddle **-** boop **-** slap **-** hello **-** joke **-** randomreddit **-** opinion **-** 8ball **-** kiss **-** punch **-** flipoff **-** laugh **-** cry **-** cringe **-** blush **-** stare', false)
      .setFooter('Made with 💖 by YAMAHA#0001', "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png");


    const msg = await message.reply("Check your dms ;)");
    message.author.send(info)
      .catch(err => {
        if (err) return msg.edit(`${message.author} Oops! Your dms seem to be closed, please open them to use this command!`);
      });


  }
}
