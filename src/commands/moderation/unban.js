const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unbans mentioned user.')
        .addStringOption(option => option.setName("id").setRequired(true).setDescription("Unbans the mentioned user.")),
    permissions: [ Permissions.FLAGS.BAN_MEMBERS ],

    async execute(interaction, client) {
        const userID = interaction.options.getString('id');

        if (userID === interaction.member.id)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot unban yourself... How would you anyways?`)]})

        interaction.guild.members.unban(userID).then((user) => {
            interaction.reply({embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${userID}** has been unbanned!`)]})
        }).catch(() => {
            return interaction.reply(`Please specify a valid banned user's ID.`)
        });
    },
};
