const { Colors, EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const infractionsdb = require("../../Models/InfractionsDB");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kicks mentioned user.')
        .addUserOption(option => option.setName("target").setRequired(true).setDescription("Kicks the mentioned user."))
        .addStringOption(option => option.setName("reason").setRequired(true).setDescription("Reason for kick.")),
    permissions: [PermissionFlagsBits.KickMembers],

    async execute(interaction, client) {
        const Target = interaction.options.getMember('target');
        const KickDate = new Date(interaction.createdTimestamp).toLocaleDateString();

        configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
            if (err) throw err;
            const status = (data.ModerationCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (Target.id === interaction.member.id)
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot kick yourself!`)] })

            if (Target.permissions.has(PermissionFlagsBits.Administrator))
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ You cannot kick an administrator!`)] })

            const Reason = interaction.options.getString('reason');

            if (Reason.length > 512)
                return interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ The reason cannot exceed 512 characters!`)] })

            infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    data = new infractionsdb({
                        GuildID: interaction.guildId,
                        UserID: Target.id,
                        UserTag: `<@!${Target.id}>`,
                        Kicks: [
                            {
                                ExecuterID: interaction.user.id,
                                ExecuterTag: `<@!${interaction.user.id}>`,
                                Reason: Reason,
                                Date: KickDate
                            }
                        ],
                    })
                } else {
                    const obj = {
                        ExecuterID: interaction.user.id,
                        ExecuterTag: `<@!${interaction.user.id}>`,
                        Reason: Reason,
                        Date: KickDate
                    }
                    data.Kicks.push(obj)
                }
                data.save()
            });

            Target.kick()

            configurationDB.findOne({ GuildID: interaction.guild.id }, async (err, data) => {
                if (err) throw err;
                const status =  (data.LoggingStatus.map((w) => w.Status));
                if (`${status}` === 'true') {
                    loggingchannelfind = (data.LoggingChannel.map((w) => w.Channel))

                    infractionsdb.findOne({ GuildID: interaction.guildId, UserID: Target.id, UserTag: `<@!${Target.id}>` }, async (err, data) => {
    
                    const logEmbed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setTitle("KICK")
                    .setThumbnail(Target.displayAvatarURL())
                    .setDescription(`**${Target.user.username}** has been kicked!`)
                    .addFields({ name: '**~** Information', value: stripIndents`• Kicked by: ${interaction.user.tag}
                    • ID: ${Target.id}
                    • Reason: ${Reason}
                    • Current number of kicks: ${data.Kicks.map((i) => i).length}`, inline: false })
                    .setTimestamp()
                    .setFooter({ text: "Rodger | 📑 Logging", iconURL: `${process.env.RODGERICON}` })
    
                    interaction.guild.channels.cache.get(`${loggingchannelfind}`).send({ embeds: [logEmbed] })
                    })
                }
    
            })

            interaction.reply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`✅ **${Target.user.username}** has been kicked! | ${Target.id}`).setTimestamp().setFooter({ text: "Rodger | 👢 kick", iconURL: `${process.env.RODGERICON}` })] })
        })
    },
};
