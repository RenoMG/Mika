const { ChannelType, Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require("common-tags");
const moment = require("moment");
require("moment-duration-format");
const { getGuildConfig } = require("../../functions/getGuildConfig");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('info')
        .setDescription('Return info based in input')
        .addSubcommand(subcommand =>
            subcommand
                .setName("whois")
                .setDescription("Get information for user mentioned.")
                .addUserOption(option => option.setName("target").setDescription("The user mentioned")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription("Info about the server."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription("Returns latency and API ping."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription("Returns invite link for Mika."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription("Returns vote link for Mika."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pfp')
                .setDescription("Gets pfp of user mentioned.")
                .addUserOption(option => option.setName("target").setDescription("The user mentioned")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription("Returns general status information about Mika.")),
    async execute(interaction, message, client) {
        getGuildConfig(interaction.guild.id).then(async (data) => {
            const status = (data.InfoCommandStatus.map((w) => w.Status));
            if (`${status}` === 'false') {
                return interaction.reply({ content: `This command has been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (data.DisabledChannels.map((w) => w.Channels).includes(interaction.channel.id)) {
                return interaction.reply({ content: `Commands for this channel have been disabled by a server admin!`, flags: MessageFlags.Ephemeral })

            } else if (interaction.options.getSubcommand() === "whois") {
                const user = interaction.options.getUser("target");
                if (user) {
                    const member = interaction.options.getMember("target");
                    const roles = member.roles
                        .cache.filter(r => r.id !== interaction.guild.id)
                        .map(r => r)
                        .join(", ") || "none";
                    const userEmbed = new EmbedBuilder()
                        .setTitle("USER INFO")
                        .setThumbnail(member.displayAvatarURL())
                        .setColor(member.displayHexColor)
                        .addFields({ name: '**~** Server information', value: stripIndents`• Display name: ${member.displayName}
                      • Joined: ${member.joinedAt.toLocaleString()}
                      • Roles: ${roles}`, inline: false })

                        .addFields({ name: '**~** Account information', value: stripIndents`• ID: ${user.id}
                      • Username: ${user.username}
                      • Discord Tag: ${user.tag}
                      • Created at: ${user.createdAt.toLocaleString()}`, inline: false })

                        .setTimestamp()
                        .setFooter({ text: 'Mika | 🔎 User info', iconURL: `${process.env.MIKAICON}` });

                    await interaction.reply({ embeds: [userEmbed] });
                } else {
                    await interaction.reply('Please mention a user!');
                }

            } else if (interaction.options.getSubcommand() === "server") {
                function formatNumber(num) {
                    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
                }
                boostcheck = (`${interaction.guild.premiumSubscriptionCount}`);
                boostcount = boostcheck.replace("undefined", "0");
                var imagedata = (`${interaction.guild.iconURL()}` || 'https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png');
                var res = imagedata.replace("null", "https://theme.zdassets.com/theme_assets/678183/af1a442f9a25a27837f17805b1c0cfa4d1725f90.png");
                const owner = await interaction.guild.fetchOwner();
                const userEmbed = new EmbedBuilder()
                    .setTitle("SERVER INFO")
                    .setColor(Colors.Blue)
                    .setThumbnail(`${res}`)
                    .addFields({ name: `**~** General Info`, value: stripIndents`
                    • Owner: ${owner}
                    • Name: ${interaction.guild.name}
                    • ID: ${interaction.guild.id}
                    • Pref Locale: ${interaction.guild.preferredLocale}
                    • Creation date: ${interaction.guild.createdAt.toLocaleString()}
                    • Members: ${formatNumber(interaction.guild.memberCount)}
                    • Roles: ${interaction.guild.roles.cache.size}
                    • Verification level: ${['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'][interaction.guild.verificationLevel] ?? interaction.guild.verificationLevel}
                    • Boosts: ${boostcount}
                    • Emojis: ${interaction.guild.emojis.cache.size}`, inline: false })
                    .addFields({ name: `**~** Channels:`, value: stripIndents`
                    • Categories: ${interaction.guild.channels.cache.filter(m => m.type === ChannelType.GuildCategory).size}
                    • Text: ${interaction.guild.channels.cache.filter(m => m.type === ChannelType.GuildText).size}
                    • Voice: ${interaction.guild.channels.cache.filter(m => m.type === ChannelType.GuildVoice).size}`, inline: false })
                    .setFooter({ text: 'Mika | 📋 Server info', iconURL: `${process.env.MIKAICON}` })
                    .setTimestamp()

                await interaction.reply({ embeds: [userEmbed] });

            } else if (interaction.options.getSubcommand() === "ping") {
                const msg = await interaction.reply(`Checking...`);
                await interaction.editReply(`Latency ${interaction.client.ws.ping}ms`);

            } else if (interaction.options.getSubcommand() === "invite") {
                const userEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle("INVITE")
                    .addFields({ name: '**Here is my invite link!** ', value: `❤ ❤ [Add me!](https://discord.com/api/oauth2/authorize?client_id=795165717283471370&permissions=8&scope=bot%20applications.commands) ❤ ❤`, inline: false })
                    .setTimestamp()
                    .setFooter({ text: 'Mika | ➕ Invite!', iconURL: `${process.env.MIKAICON}` });
                await interaction.reply({ embeds: [userEmbed], flags: MessageFlags.Ephemeral });

            } else if (interaction.options.getSubcommand() === "vote") {
                const userEmbed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle("VOTE")
                    .addFields({ name: '**Vote for me on top.gg!** ', value: `❤ ❤ [Vote!](https://top.gg/bot/664244372723728424/vote) ❤ ❤`, inline: false })
                    .setTimestamp()
                    .setFooter({ text: 'Mika | 👍 Vote!', iconURL: `${process.env.MIKAICON}` });
                await interaction.reply({ embeds: [userEmbed], flags: MessageFlags.Ephemeral });

            } else if
                (interaction.options.getSubcommand() === "pfp") {
                const user = interaction.options.getUser("target");
                if (user) {
                    const member = interaction.options.getMember("target");
                    const roles = member.roles
                        .cache.filter(r => r.id !== interaction.guild.id)
                        .map(r => r)
                        .join(", ") || "none";
                    const userEmbed = new EmbedBuilder()
                        .setTitle("PFP")
                        .setImage(member.displayAvatarURL())
                        .setColor(member.displayHexColor)
                        .setDescription(`**Here is the pfp of ${member.displayName}.**`, false)
                        .setTimestamp()
                        .setFooter({ text: 'Mika | 🐹 AVATAR!', iconURL: `${process.env.MIKAICON}` });

                    await interaction.reply({ embeds: [userEmbed] });
                } else {
                    await interaction.reply('Please mention a user!');
                }

            } else if (interaction.options.getSubcommand() === "status") {

                const promises = [
                    interaction.client.shard.fetchClientValues('guilds.cache.size'),
                    interaction.client.shard.broadcastEval(c => c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0)),
                ];

                Promise.all(promises)
                    .then(results => {
                        const totalGuilds = results[0].reduce((acc, guildCount) => acc + guildCount, 0);
                        const totalMembers = results[1].reduce((acc, memberCount) => acc + memberCount, 0);

                        function formatNumber(num) {
                            return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
                        }

                        let uptime = ``;
                        let statsmoment = require("moment");
                        let duration = statsmoment.duration(interaction.client.uptime).format(" D [days], H [hrs], m [mins], s [secs]");

                        uptime += `${duration}`;

                        const userEmbed = new EmbedBuilder()
                            .setTitle("STATS")
                            .setColor(Colors.Blue)
                            .addFields({ name: '**~** Uptime', value: `${uptime}`, inline: false })
                            .addFields({ name: '**~** Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: false })
                            .addFields({ name: '**~** General Stats', value: stripIndents`
				• Servers: ${formatNumber(totalGuilds)}
				• Channels: ${formatNumber(interaction.client.channels.cache.size)}
                • Users: ${formatNumber(totalMembers)}
                • Latency: ${interaction.client.ws.ping}ms
                • Shards: ${interaction.client.shard.count}
                • Shard ID: ${interaction.guild.shard.id}`, inline: false })

                            .setFooter({ text: 'Mika | 💾 Stats', iconURL: `${process.env.MIKAICON}` })
                            .setTimestamp()

                        return interaction.reply({ embeds: [userEmbed] });
                    })

            } else {

                await interaction.reply("no subcommand was used.");
            }
        })
    },
};
