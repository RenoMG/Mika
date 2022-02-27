const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks mentioned user.')
        .addUserOption(option => option.setName("target").setRequired(true).setDescription("Kicks the mentioned user."))
        .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for kick.")),
    permissions: [ Permissions.FLAGS.KICK_MEMBERS ],

    async execute(interaction, client) {
        const Target = interaction.options.getMember('target');

        if (Target.id === interaction.member.id)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot kick yourself!`)]})

        if (Target.permissions.has('ADMINISTRATOR'))
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot kick an administrator!`)]})

        const Reason = interaction.options.getString('reason');

        if (Reason.length > 512)
        return interaction.reply({embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`)]})

        Target.kick()

        interaction.reply({embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.user.username}** has been kicked! | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 👢 kick", iconURL: `${process.env.RODGERICON}` })]})
    },
};
