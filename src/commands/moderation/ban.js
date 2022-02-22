const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bans mentioned user.')
        .addUserOption(option => option.setName("target").setRequired(true).setDescription("Bans the mentioned user."))
        .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for ban."))
        .addStringOption(option => option.setName("messages").setRequired(true).setDescription("Choose to delete messages.").addChoice("Don't delete any", "0").addChoice("Previous 7 days", "7")),
    permissions: [ Permissions.FLAGS.BAN_MEMBERS ],

    async execute(interaction, client) {
        const Target = interaction.options.getMember('target');

        if (Target.id === interaction.member.id)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot ban yourself!`)]})

        if (Target.permissions.has('ADMINISTRATOR'))
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot ban an administrator!`)]})

        const Reason = interaction.options.getString('reason');

        if (Reason.length > 512)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`)]})

        const Amount =  interaction.options.getString('messages')

        Target.ban({ days: Amount, reason: Reason})

        interaction.reply({embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.user.username}** has been banned! | ${Target.id}`)]})
    },
};
