const {
  MessageEmbed
} = require("discord.js")
const fs = require("fs");
const Keyv = require('keyv');
const {
  stripIndents
} = require("common-tags");
const {
  config
} = require("dotenv");
config({
  path: __dirname + "/.env"
});

const globalPrefix = '.';
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });
const logging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'logging' });
const modlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'modlogging' });
const logchannels = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setlogchannels' });
const serverlogschannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'serverlogschannel' });
const deletelogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'deletelogging' });
const editlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'editlogging' });
const visitorlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'visitorlogging' });

module.exports = {
  name: "logging",
  aliases: ["log"],
  category: "config",
  description: "Changes server log channel",
  usage: "<args>",
  run: async (client, message, args) => {

    const clearArray = message.content.split(" ");
    const clearArgs = clearArray.slice(1);

    var imagedata = (`${message.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
    var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");

    const helpembed = new MessageEmbed()
      .setColor("RED")
      .setTitle("LOGGING COMMAND HELP")
      .addField(`**Commands**`,
        stripIndents`
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging help
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging set mod "channel"
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging set server "channel"
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging disable/enable mod
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging disable/enable server
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging disable/enable server delete
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging disable/enable server edit
            • ${await prefixes.get(message.guild.id) || globalPrefix}logging disable/enable server visitor`, false)
      .setTimestamp()
      .setFooter("Rodger | 📝 logging!", `${res}`)

    if (clearArgs[0] === 'help') {
      return message.channel.send(helpembed);
    };

    if (clearArgs[0] === 'set') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please select a logging type!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable logging!");
      if (clearArgs[1] === 'mod') {
        setlogchannel = (`${await logchannels.set(message.guild.id, args.slice(2))}`);
        return message.reply(`Moderation log channel now set to \`${args.slice(2)}\``);
      }
      if (clearArgs[1] === 'moderation') {
        setlogchannel = (`${await logchannels.set(message.guild.id, args.slice(2))}`);
        return message.reply(`Moderation log channel now set to \`${args.slice(2)}\``);
      }
      if (clearArgs[1] === 'server') {
        setlogchannel = (`${await serverlogschannel.set(message.guild.id, args.slice(2))}`);
        return message.reply(`Server log channel now set to \`${args.slice(2)}\``);
      } else {
        return message.reply("Please select a proper logging type!");
      }
    };

    if (clearArgs[0] === 'enable') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please select a logging type!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to enable logging!");
      if (clearArgs[1] === 'mod') {
        enablemodlogging = (`${await modlogging.set(message.guild.id, 'true')}`);
        return message.reply(`Moderation logging is now enabled!`);
      }
      if (clearArgs[1] === 'moderation') {
        disablemodlogging = (`${await modlogging.set(message.guild.id, 'true')}`);
        return message.reply(`Moderation logging is now enabled!`);
      }
      if (clearArgs[2] === 'delete') {
        disableserverlogging = (`${await deletelogging.set(message.guild.id, 'true')}`);
        return message.reply(`Server message delete logging is now enabled!`);
      }
      if (clearArgs[2] === 'edit') {
        disableserverlogging = (`${await editlogging.set(message.guild.id, 'true')}`);
        return message.reply(`Server message edit logging is now enabled!`);
      }
      if (clearArgs[2] === 'visitor') {
        disableserverlogging = (`${await visitorlogging.set(message.guild.id, 'true')}`);
        return message.reply(`Server visitor logging is now enabled!`);
      }
      if (clearArgs[1] === 'server') {
        enableserverlogging = (`${await logging.set(message.guild.id, 'true')}`);
        return message.reply(`Server logging is now enabled!`);


      } else {
        return message.reply("Please select a proper logging type!");
      }
    };

    if (clearArgs[0] === 'disable') {
      // No author permissions
      if (args.length < 2)
        return message.reply("Please select a logging type!")
      if (!message.member.hasPermission("ADMINISTRATOR"))
        return message.reply("You need to have the `ADMINISTRATOR` permission to disable logging!");
      if (clearArgs[1] === 'mod') {
        disablemodlogging = (`${await modlogging.set(message.guild.id, 'false')}`);
        return message.reply(`Moderation logging is now disabled!`);
      }
      if (clearArgs[1] === 'moderation') {
        disablemodlogging = (`${await modlogging.set(message.guild.id, 'false')}`);
        return message.reply(`Moderation logging is now disabled!`);
      }
      if (clearArgs[2] === 'delete') {
        disableserverlogging = (`${await deletelogging.set(message.guild.id, 'false')}`);
        return message.reply(`Server message delete logging is now disabled!`);
      }
      if (clearArgs[2] === 'edit') {
        disableserverlogging = (`${await editlogging.set(message.guild.id, 'false')}`);
        return message.reply(`Server message edit logging is now disabled!`);
      }
      if (clearArgs[2] === 'visitor') {
        disableserverlogging = (`${await visitorlogging.set(message.guild.id, 'false')}`);
        return message.reply(`Server visitor logging is now disabled!`);
      }
      if (clearArgs[1] === 'server') {
        disableserverlogging = (`${await logging.set(message.guild.id, 'false')}`);
        return message.reply(`Server logging is now disabled!`);


      } else {
        return message.reply("Please select a proper logging type!");
      }
    };

    modvalue0 = (`${await modlogging.get(message.guild.id)}`);
    var modvalue1 = modvalue0.replace("undefined", "true");
    servvalue0 = (`${await logging.get(message.guild.id)}`);
    var servvalue1 = servvalue0.replace("undefined", "true");
    serveditvalue0 = (`${await deletelogging.get(message.guild.id)}`);
    var serveditvalue1 = serveditvalue0.replace("undefined", "true");
    servdeletevalue0 = (`${await editlogging.get(message.guild.id)}`);
    var servdeletevalue1 = servdeletevalue0.replace("undefined", "true");
    visitorvalue0 = (`${await visitorlogging.get(message.guild.id)}`);
    var visitorvalue1 = visitorvalue0.replace("undefined", "true");


    const embed = new MessageEmbed()
      .setColor("RED")
      .setTitle("LOGGING STATUS")
      .addField(`**Log value statuses**`,
        stripIndents`
                        • Moderation logging enabled?: '\`${modvalue1}\`'
                        • Server logging enabled?: '\`${servvalue1}\`'
                        • Current moderation logging channel?: '\`${await logchannels.get(message.guild.id)}\`'
                        • Current server logging channel?: '\`${await serverlogschannel.get(message.guild.id)}\`'
                        • Server message delete logging enabled?: '\`${serveditvalue1}\`'
                        • Server message edit logging enabled?: '\`${servdeletevalue1}\`'
                        • Server visitor logging enabled?: '\`${visitorvalue1}\`'`, false)
      .setTimestamp()
      .setFooter("Rodger | 📝 logging!", `${res}`)

    message.channel.send(embed);
    return message.channel.send(`Use ${await prefixes.get(message.guild.id) || globalPrefix}logging help for the command list.`);
  }

}
