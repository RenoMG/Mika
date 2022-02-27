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
        const Target = interaction.options.getMember('id');

        if (Target.id === interaction.member.id)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot unban yourself... How would you anyways?`)]})

        Target.unban(Target.id)

        interaction.reply({embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.id}** has been unbanned!`)]})
    },
};
