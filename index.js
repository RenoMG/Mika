const { Client, MessageEmbed, Collection } = require("discord.js");
const { config } = require("dotenv");
const fs = require("fs");
const Keyv = require('keyv');
const usedCommandRecently = new Set();
const { stripIndents } = require("common-tags");

const logchannels = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setlogchannels' });
const serverlogschannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'serverlogschannel' });
const prefixes = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setprefix' });
const welcomemsg = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setwelcomemsg' });
const welcomechannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setwelcomechannel' });
const goodbyemsg = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setgoodbyemsg' });
const goodbyechannel = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setgoodbyechannel' });
const commandcount = new Keyv(`${process.env.BOTRELATEDKEYV}`, { namespace: 'setcommandcount' });
const server = new Keyv(`${process.env.BOTRELATEDKEYV}`, { namespace: 'setblacklist' });
const moderation = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'moderation' });
const fun = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'fun' });
const info = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'info' });
const deletelogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'deletelogging' });
const editlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'editlogging' });
const visitorlogging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'visitorlogging' });
const logging = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'logging' });
const autorolesettings = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setautorolesettings' });
const autorole = new Keyv(`${process.env.SETTINGSKEYV}`, { namespace: 'setautorole' });
const globalPrefix = '.';
const client = new Client({
  intents: ["GUILDS", "GUILD_MESSAGES", "GUILD_ROLE_CREATE", "GUILD_ROLE_UPDATE", ""],
  disableMentions: 'everyone'
});
client.queue = new Map();


/*
const DBL = require("dblapi.js");
const dbl = new DBL(`${process.env.DBLTOKEN}`, client);

const discordbots = require('discord.bots.gg');
const dbots = new discordbots(`${process.env.BOTSGGID}`, `${process.env.BOTSGGTOKEN}`);
*/

client.commands = new Collection();
client.aliases = new Collection();

client.categories = fs.readdirSync("./commands/");

config({
  path: __dirname + "/.env"
});

["command"].forEach(handler => {
  require(`./handler/${handler}`)(client);
});

client.on("ready", async guild => {
  console.log("Starting...");
  await prefixes.set(827751682937978880, '.');
  console.log("Rodger is online and databse connection active.");
});

client.on("ready", () => {
  client.user.setActivity('.help', {
    type: "WATCHING"
  });
  const promises = [
    client.shard.fetchClientValues('guilds.cache.size'),
    client.shard.broadcastEval('this.guilds.cache.reduce((prev, guild) => prev + guild.memberCount, 0)'),
  ];

  Promise.all(promises)
    .then(results => {
      const serverCount = results[0].reduce((prev, guildCount) => prev + guildCount, 0);

      shardCount = (client.shard.count);

      function formatNumber(num) {
        return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
      }
      /*
      dbots.postStats(`${formatNumber(serverCount)}`, client.shard.count, client.shard.Id)
      console.log("discord.bots.gg WORKS");

      dbl.postStats(`${formatNumber(serverCount)}`, client.shard.Id, client.shard.count);
      console.log("DBL WORKS");
      */
    })
});

client.on('guildDelete', async guild => {
  client.channels.cache.get('827708720616046683').send(`⬇ \`${guild.name}\` **Has removed me!** GUILDID:(\`${guild.id}\`)`);
});

client.on('guildCreate', async guild => {
  client.channels.cache.get('827708720616046683').send(`⬆ \`${guild.name}\` With \`${guild.memberCount}\` Members **has added me!** GUILDID:(\`${guild.id}\`)`);
});

client.on('guildCreate', async guild => {
  await serverlogschannel.set(guild.id, 'rodger-logs')
});
client.on('guildCreate', async guild => {
  await logchannels.set(guild.id, 'rodger-logs')
});

client.on('guildCreate', async guild => {
  await welcomemsg.set(guild.id, 'Welcome {user} to our server!')
});

client.on('guildCreate', async guild => {
  await welcomechannel.set(guild.id, 'rodger-welcome')
});

client.on('guildCreate', async guild => {
  await goodbyechannel.set(guild.id, 'rodger-goodbye')
});

client.on('guildCreate', async guild => {
  await goodbyemsg.set(guild.id, '{user} has left the server!')
});

String.prototype.replaceAll = function (search, replacement) {
  const target = this;
  return target.split(search).join(replacement);
};
client.on('guildMemberAdd', async member => {
  try {
    welcomechannelfind = `${await welcomechannel.get(member.guild.id)}`;
    welcomechannelname = member.guild.channels.cache.find(channel => channel.name === `${welcomechannelfind}`);
    welcomemessagecontent = `${await welcomemsg.get(member.guild.id)}`;

    check = (`${await server.get(member.guild.id)}`);
    if (check.includes('true'))
      return;

    if (welcomemessagecontent.includes('{user}'))
      return welcomechannelname.send(welcomemessagecontent.replace(/{user}/gi, `<@${member.user.id}>`))

    if (welcomemessagecontent.includes('{userd}'))
      return welcomechannelname.send(welcomemessagecontent.replace(/{userd}/gi, `${member.displayName}`))

    return welcomechannelname.send(welcomemessagecontent)

  } catch (err) {
    return;
  }
});

client.on('guildMemberAdd', async member => {
  try {

    autorolecheck = (`${await autorolesettings.get(member.guild.id)}`);
    if (autorolecheck.includes('false'))
      return;
    autorolecheck1 = (`${await autorolesettings.get(member.guild.id)}`);
    if (autorolecheck1.includes('undefined'))
      return;
    autorolecontent = (`${await autorole.get(member.guild.id)}`);
    let userautorole = member.guild.roles.cache.find(r => r.name === `${autorolecontent}`);
    member.addRole(userautorole.id);

  } catch (err) {
    console.log(err);
  }
});

client.on('guildMemberRemove', async member => {
  try {
    goodbyechannelfind = `${await goodbyechannel.get(member.guild.id)}`;
    goodbyechannelname = member.guild.channels.cache.find(channel => channel.name === `${goodbyechannelfind}`);
    goodbyemessagecontent = `${await goodbyemsg.get(member.guild.id)}`;

    check = (`${await server.get(member.guild.id)}`);
    if (check.includes('true'))
      return;

    if (goodbyemessagecontent.includes('{user}'))
      return goodbyechannelname.send(goodbyemessagecontent.replace(/{user}/gi, `<@${member.user.id}>`))

    if (goodbyemessagecontent.includes('{userd}'))
      return goodbyechannelname.send(goodbyemessagecontent.replace(/{userd}/gi, `${member.displayName}`))

    return goodbyechannelname.send(goodbyemessagecontent)
  } catch (err) {
    return;
  }
});

//Server logging events LOGGING
client.on("messageDelete", async (messageDelete) => {

  var count1 = 1950;
  var textdata1 = (messageDelete.content || `Message content was an embed.`);
  var textresult1 = textdata1.slice(0, count1) + (textdata1.length > count1 ? "..." : " ");

  try {
    const deletelogembed = new MessageEmbed()
      .setTitle("LOG - Message deleted")
      .setColor("#fff200")
      .setThumbnail(messageDelete.author.displayAvatarURL)
      .setFooter(messageDelete.author.tag)
      .setTimestamp()
      .setDescription(stripIndents`**Message content:**
       ${textresult1}
        **Channel:**
        <#${messageDelete.channel.id}>
        **Message ID:**
        ${messageDelete.id}`, false);

    logchannelfind = `${await serverlogschannel.get(messageDelete.guild.id)}`;
    logchannelname = messageDelete.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
    check2 = (`${await logging.get(messageDelete.guild.id)}`);
    if (check2.includes('false'))
      return;
    check1 = (`${await deletelogging.get(messageDelete.guild.id)}`);
    if (check1.includes('false'))
      return;
    return logchannelname.send(deletelogembed);
  } catch (err) {
    return;
  }
});

client.on("messageUpdate", async (oldMessage, newMessage) => {

  var count2 = 950;
  var textdata2 = (oldMessage.content || `Message content was an embed.`);
  var textresult2 = textdata2.slice(0, count2) + (textdata2.length > count2 ? "..." : " ");

  var count3 = 950;
  var textdata3 = (newMessage.content || `Message content was an embed.`);
  var textresult3 = textdata3.slice(0, count3) + (textdata3.length > count3 ? "..." : " ");
  try {
    if (oldMessage.content === newMessage.content) {
      return;
    }
    const messageupdatelogembed = new MessageEmbed()
      .setTitle("LOG - Message Edited")
      .setColor("#fff200")
      .setThumbnail(oldMessage.author.displayAvatarURL)
      .setFooter(oldMessage.author.tag)
      .setTimestamp()
      .setDescription(stripIndents`**Old message content:**
         ${textresult2}
         **New message content:**
         ${textresult3}

         **Channel:**
         <#${oldMessage.channel.id}>
         **Message ID:**
         ${oldMessage.id}`, false);

    logchannelfind = `${await serverlogschannel.get(oldMessage.guild.id)}`;
    logchannelname = oldMessage.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
    check2 = (`${await logging.get(oldMessage.guild.id)}`);
    if (check2.includes('false'))
      return;
    check1 = (`${await editlogging.get(oldMessage.guild.id)}`);
    if (check1.includes('false'))
      return;
    return logchannelname.send(messageupdatelogembed);
  } catch (err) {
    return;
  }
});

client.on("guildMemberAdd", async (member) => {
  try {
    const joinlogembed = new MessageEmbed()
      .setTitle("LOG - User joined")
      .setColor("GREEN")
      .setThumbnail(member.user.displayAvatarURL)
      .setFooter(member.user.tag)
      .setTimestamp()
      .setDescription(stripIndents`**Name:**
           ${member.displayName}

            **Account creation:**
            ${member.user.createdAt}
            **ID:**
            ${member.user.id}`, false);

    logchannelfind = `${await serverlogschannel.get(member.guild.id)}`;
    logchannelname = member.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
    check2 = (`${await logging.get(member.guild.id)}`);
    if (check2.includes('false'))
      return;
    check1 = (`${await visitorlogging.get(member.guild.id)}`);
    if (check1.includes('false'))
      return;
    return logchannelname.send(joinlogembed);
  } catch (err) {
    return;
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    const leavelogembed = new MessageEmbed()
      .setTitle("LOG - User left")
      .setColor("RED")
      .setThumbnail(member.user.displayAvatarURL)
      .setFooter(member.user.tag)
      .setTimestamp()
      .setDescription(stripIndents`**Name:**
             ${member.displayName}

              **Account creation:**
              ${member.user.createdAt}
              **ID:**
              ${member.user.id}`, false);

    logchannelfind = `${await serverlogschannel.get(member.guild.id)}`;
    logchannelname = member.guild.channels.cache.find(channel => channel.name === `${logchannelfind}`);
    check2 = (`${await logging.get(member.guild.id)}`);
    if (check2.includes('false'))
      return;
    check1 = (`${await visitorlogging.get(member.guild.id)}`);
    if (check1.includes('false'))
      return;
    return logchannelname.send(leavelogembed);
  } catch (err) {
    return;
  }
});

//On message enavnts MAIN
client.on('message', async (message, guild) => {

  try {

    const embed = new MessageEmbed()
      .setColor("RED")
      .setTitle("**Hey, slow it down!**")
      .setDescription("You need to wait `2s` inbetween the use of commands.")

    if (message.author.bot) return;

    if (message.channel.type === 'dm')
      return message.reply("Please use my commands in a server!");

    let args;
    // handle messages in a guild
    if (message.guild) {
      let prefix;

      const guildPrefix = await prefixes.get(message.guild.id);
      if (message.content.startsWith(guildPrefix)) {
        prefix = guildPrefix;
      } else {
        if (message.content.startsWith(globalPrefix) && (`${guildPrefix}` == ('undefined')))
          prefix = globalPrefix;
      }

      // if we found a prefix, setup args; otherwise, this isn't a command
      if (!prefix) return;
      args = message.content.slice(prefix.length).split(/\s+/);
    } else {
      // handle DMs
      const slice = message.content.startsWith(globalPrefix) ? globalPrefix.length : 0;
      args = message.content.slice(slice).split(/\s+/);
    }

    // get the first space-delimited argument after the prefix as the command
    const cmd = args.shift().toLowerCase();

    if (cmd.lenght === 0) return;

    let command = client.commands.get(cmd);
    if (!command) command = client.commands.get(client.aliases.get(cmd));

    check = (`${await server.get(message.guild.id)}`);
    if (check.includes('true'))
      return client.channels.cache.get('827708720616046683').send(`❌ **Blacklisted server** \`${message.guild.name}\` Tried to use a command! COMMANDUSED:(\`${command.name}\`) COMMANDCATEGORY:(\`${command.category}\`) MESSAGECONTENT:('\`!${args}!\`') GUILDID:(\`${message.guild.id}\`)`);

    check1 = (`${await moderation.get(message.guild.id)}` + command.category);
    if (check1.includes('falsemoderation'))
      return;

    check1 = (`${await fun.get(message.guild.id)}` + command.category);
    if (check1.includes('falseuser'))
      return;

    check1 = (`${await info.get(message.guild.id)}` + command.category);
    if (check1.includes('falseinfo'))
      return;

    if (usedCommandRecently.has(message.author.id)) {
      message.channel.send(embed);
    } else {

      if (command)
        command.run(client, message, args);

      client.channels.cache.get('827708720616046683').send(`💻 \`${message.guild.name}\` **Has used a command!** COMMANDUSED:(\`${command.name}\`) COMMANDCATEGORY:(\`${command.category}\`) MESSAGECONTENT:('\`!${args}!\`') CHANNEL:(\`${message.channel.name}\`) USER:(\`${message.member.user.tag}\`) GUILDID:(\`${message.guild.id}\`)`);

      count = `${await commandcount.get('msgcount')}`;

      function newCount() {
        return ++count;
      }

      await commandcount.set('msgcount', `${newCount()}`);

      usedCommandRecently.add(message.author.id);
      setTimeout(() => {
        usedCommandRecently.delete(message.author.id)
      }, 2000);
    }
  } catch (err) {
    return;
  }
});

client.login(process.env.DEVTOKEN);
