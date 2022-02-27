const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions, Message } = require('discord.js');
const { stripIndents } = require("common-tags");
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Mute management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Mutes mentioned user.')
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("Mutes the mentioned user."))
                .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for mute."))
                .addStringOption(option => option.setName("time").setDescription("optional - how long to mute user.").addChoice("30 minutes", "1800s").addChoice("1 Hour", "1h").addChoice("1 Day", "1d").addChoice("1 Week", "7d")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("remove")
                .setDescription("Unmuted mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    permissions: [Permissions.FLAGS.KICK_MEMBERS],
    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const Target = interaction.options.getMember("target");
        const Reason = interaction.options.getString("reason")
        const Time = interaction.options.getString("time") || " "

        let muterole = interaction.guild.roles.cache.find((role) => role.name === 'Muted')

        if (Sub === 'add') {

            if (Target.id === interaction.member.id)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot mute yourself!`)] })

            if (Target.permissions.has('ADMINISTRATOR'))
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ You cannot mute an administrator!`)] })

            if (Reason.length > 512)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ The reason cannot exceed 512 characters!`)] })

            if (!muterole)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ No "Muted" role exists, please make the role and try again!`)] })

            await Target.roles.add(muterole)
            setTimeout(async () => {
                if (!Target.roles.cache.has(muterole)) return;
                await Target.roles.remove(muterole)
            }, (ms(Time)))

            interaction.reply({ embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.user.username}** has been muted! ${Time} | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 🤫 mute", iconURL: `${process.env.RODGERICON}` })] })
        } else if (Sub === 'remove') {

            if (!muterole)
                return interaction.reply({ embeds: [new MessageEmbed().setColor('RED').setDescription(`❌ No "Muted" role exists, please make the role and try again!`)] })

            Target.roles.remove(muterole)

            interaction.reply({ embeds: [new MessageEmbed().setColor("GREEN").setDescription(`✅ **${Target.user.username}** has been unmuted! | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 🤫 mute", iconURL: `${process.env.RODGERICON}` })] })
        }
    },
};
