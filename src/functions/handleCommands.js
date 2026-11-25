const fs = require('fs');

module.exports = (client) => {
  client.handleCommands = async (commandFolders, path) => {
    client.commandArray = [];
    for (const folder of commandFolders) {
      // Top-level files only. Handler modules live in subfolders (configuration/handlers)
      // and are required by their command, not registered as slash commands.
      const commandFiles = fs.readdirSync(`${path}/${folder}`).filter((file) => file.endsWith('.js'));
      for (const file of commandFiles) {
        const loaded = require(`../commands/${folder}/${file}`);
        const commands = Array.isArray(loaded)
          ? loaded
          : (loaded && Array.isArray(loaded.commands) ? loaded.commands : [loaded]);
        for (const command of commands) {
          if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
            console.warn(`Skipping src/commands/${folder}/${file}: not a slash command module.`);
            continue;
          }
          client.commands.set(command.data.name, command);
          client.commandArray.push(command.data.toJSON());
        }
      }
    }

    for (const command of client.commandArray) {
      console.log(
        `Command /${command.name}` +
        ` default_member_permissions=${command.default_member_permissions ?? 'null'}` +
        ` contexts=${JSON.stringify(command.contexts ?? null)}` +
        ` dm_permission=${command.dm_permission ?? 'null'}`
      );
    }
  };
};
