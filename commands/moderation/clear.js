

module.exports = {
  name: "clear",
  aliases: ["purge", "nuke", "c"],
  category: "moderation",
  description: "Clears messages from chat.",
  run: async (client, message, args) =>  {

    //Member doesn't have permissions
    if (!message.member.hasPermission("MANAGE_MESSAGES"))
      return message.reply("You are missing the `MANAGE_MESSAGES` permission.");

    //Check if args[o] is a number
    if (isNaN(args[0]))
      return  message.channel.send("Please enter a valid argument.");

    //Bot can't delete messages
    if (!message.guild.me.hasPermission("MANAGE_MESSAGES"))
      return message.channel.send("I am missing the `MANAGE_MESSAGES` permission.");

    if (args[0] > 100)
    return message.channel.send("Arguments need to be between 0 and 100!");

    message.channel.bulkDelete(args[0])
    .then(messages => message.channel.send(`The messages have been deleted!`))
    .catch(err => message.channel.send(`Error deleting the messages`));

   }
}
