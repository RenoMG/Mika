const usedCommandRecently = new Set();

module.exports = {
  name: "echo",
  category: "unlistedcommands",
  description: "Echos user text.",
  run: async (client, message, args) => {

      if(usedCommandRecently.has(message.author.id)){
          message.reply("Command on cooldown! Please wait 2m.");
      } else {

    if (message.deletable) message.delete();

    if (args.length < 1)
      return message.reply("Please enter some text!")

      const sayMessage = args.join(" ");
       message.delete().catch(O_o=>{})

       message.channel.send(sayMessage);

       usedCommandRecently.add(message.author.id);
       setTimeout(() => {
         usedCommandRecently.delete(message.author.id)
       }, 120000);
     }
    }
  }
