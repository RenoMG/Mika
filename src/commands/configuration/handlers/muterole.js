const { Colors, EmbedBuilder } = require('discord.js');
const { loadConfig, setKeyed } = require('./configFields');

module.exports = async function muterole(interaction) {
    const muterolerole = interaction.options.getRole('role');

    if (muterolerole == null) {
        return interaction.reply('Nothing was changed!');
    }

    if (!muterolerole.editable) {
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription('❌ I cannot access that role!')] });
    }

    if (!muterolerole.id) {
        return interaction.reply('Nothing was changed!');
    }

    const data = await loadConfig(interaction.guildId);
    setKeyed(data, 'Muterole', 'Role', muterolerole.id);
    await data.save();
    return interaction.reply('Server config has been updated!');
};
