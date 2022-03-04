const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('asdasdasd')
        .setDescription('Ban management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('asdasdasda')
                .setDescription('Bans mentioned user.')
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("Bans the mentioned user."))
                .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for ban."))
                .addStringOption(option => option.setName("messages").setRequired(true).setDescription("Choose to delete messages.").addChoice("Don't delete any", "0").addChoice("Previous 7 days", "7")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('asdasdasd')
                .setDescription('Unbans mentioned user.')
                .addStringOption(option => option.setName("id").setRequired(true).setDescription("Unbans the mentioned user."))),
    permissions: [Permissions.FLAGS.BAN_MEMBERS],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember('target');
        const BanDate = new Date(interaction.createdTimestamp).toLocaleDateString();

    },
};
