const Levels = require('discord-xp');

Levels.setURL(`${process.env.RODGERDATABASE}`)

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {

            if (command.permissions && command.permissions.length > 0) {
                if (!interaction.member.permissions.has(command.permissions)) return await interaction.reply(`You do not have permission to use this command!`);
                if (!interaction.guild.me.permissions.has(command.permissions)) return await interaction.reply(`I don't have the right permission to do this command!`)
            }

            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
        }
    },
};