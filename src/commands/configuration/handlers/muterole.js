const { Colors, EmbedBuilder } = require('discord.js');
const configurationDB = require('../../../Models/ConfigurationDB');
const { getGuildConfig } = require('../../../utils/getGuildConfig');

module.exports = async function muterole(interaction) {
    const muterolerole = interaction.options.getRole("role");

if (muterolerole === null) {
    return interaction.reply(`Nothing was changed!`);
} else {
    getGuildConfig(interaction.guildId).then(async (data) => {
        if (!muterolerole.editable) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ I cannot access that role!`)] })
        }
        if (!data) {
            data = new configurationDB({
                GuildID: interaction.guildId,
                Muterole: [
                    {
                        Role: muterolerole.id
                    }
                ]
            })
        } else {
            if (muterolerole === null) {

            } else {
                data.Muterole.splice(0, 1)
                const obj = {
                    Role: muterolerole.id
                }
                data.Muterole.push(obj)
            }
        }
        data.save()
        interaction.reply(`Server config has been updated!`)
    });
}
};
