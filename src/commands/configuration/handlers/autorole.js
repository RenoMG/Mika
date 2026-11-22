const { loadConfig, setKeyed, setStatus } = require('./configFields');

module.exports = async function autorole(interaction) {
    const autorole = interaction.options.getRole('role');
    const autorolestatus = interaction.options.getString('status');

    if (autorole == null && autorolestatus == null) {
        return interaction.reply('Nothing was changed!');
    }

    const data = await loadConfig(interaction.guildId);
    if (autorole != null && autorole.id) setKeyed(data, 'AutoroleRole', 'Role', autorole.id);
    if (autorolestatus != null) setStatus(data, 'AutoroleStatus', autorolestatus);

    await data.save();
    return interaction.reply('Server config has been updated!');
};
