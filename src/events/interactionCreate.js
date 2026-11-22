const { MessageFlags } = require('discord.js');
const guildConfig = require('../utils/getGuildConfig');
const { evaluateCommandGates } = require('../utils/commandGates');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        if (!interaction.isChatInputCommand()) return;

        const command = client.commands.get(interaction.commandName);

        if (!command) return;

        try {
            const memberHas = command.permissions?.length
                ? interaction.member.permissions.has(command.permissions)
                : true;
            const botHas = command.permissions?.length
                ? interaction.guild.members.me.permissions.has(command.permissions)
                : true;
            const channelId = interaction.channel.id;
            // Permission is decided before the guild document is read, matching the old
            // interactionCreate check that ran before execute (and before getGuildConfig).
            let gate = evaluateCommandGates({ command, config: null, channelId, memberHas, botHas });
            if (!gate && (command.configKey || command.checkDisabledChannels)) {
                const config = await guildConfig.getGuildConfig(interaction.guild.id);
                gate = evaluateCommandGates({ command, config, channelId, memberHas: true, botHas: true });
            }

            if (gate) return await interaction.reply(gate);

            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
    },
};
