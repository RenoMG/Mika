

module.exports = {
  name: "members",
  category: "info",
  aliases: ["users", "membercount", "usercount"],
  description: "Returns member count.",
  run: async (client, message, args) => {

    function formatNumber(num) {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

    const msg = await message.channel.send(`Counting members...`);

    msg.edit(`This server currently has ${formatNumber(message.guild.memberCount)} members!`)
  }
}
