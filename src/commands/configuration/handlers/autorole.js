const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function autorole(interaction) {
    const autorole = interaction.options.getRole("role");
    const autorolestatus = interaction.options.getString("status");

if (autorole === null && autorolestatus === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        if (!data) {
            data = new configurationDB({
                GuildID: interaction.guildId,
                AutoroleStatus: [
                    {
                        Status: autorolestatus
                    }
                ],
                AutoroleRole: [
                    {
                        Role: autorole.id
                    }
                ],
            })
        } else {
            if (autorole === null) {

            } else {
                data.AutoroleRole.splice(0, 1)
                const obj = {
                    Role: autorole.id
                }
                data.AutoroleRole.push(obj)
            }

            if (autorolestatus === null) {

            } else {
                data.AutoroleStatus.splice(0, 1)
                const obj = {
                    Status: autorolestatus
                }
                data.AutoroleStatus.push(obj)
            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });
}
};
