const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { stripIndents } = require("common-tags");
const moment = require("moment");
require("moment-duration-format");

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
                .setDescription("Returns invite link for Rodger."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('vote')
                .setDescription("Returns vote link for Rodger."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('pfp')
                .setDescription("Gets pfp of user mentioned.")
                .addUserOption(option => option.setName("target").setDescription("The user mentioned")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription("Returns general status information about Rodger.")),
    async execute(interaction, message, client) {
        if (interaction.options.getSubcommand() === "whois") {
            const user = interaction.options.getUser("target");
            if (user) {
                const member = interaction.options.getMember("target");
                const roles = member.roles
                    .cache.filter(r => r.id !== interaction.guild.id)
                    .map(r => r)
                    .join(", ") || "none";
                const userEmbed = new MessageEmbed()
                    .setTitle("USER INFO")
                    .setThumbnail(member.displayAvatarURL())
                    .setColor(member.displayHexColor)
                    .addField('**~** Server information', stripIndents`• Display name: ${member.displayName}
                      • Joined: ${member.joinedAt.toLocaleString()}
                      • Roles: ${roles}`, false)

                    .addField('**~** Account information', stripIndents`• ID: ${user.id}
                      • Username: ${user.username}
                      • Discord Tag: ${user.tag}
                      • Created at: ${user.createdAt.toLocaleString()}`, false)

                    .setTimestamp()
                    .setFooter({ text: 'Rodger | 🔎 User info', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" });

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
            const userEmbed = new MessageEmbed()
                .setTitle("SERVER INFO")
                .setColor("ORANGE")
                .setThumbnail(`${res}`)
                .addField(`**~** General Info`,
                    stripIndents`
                    • Owner: ${owner}
                    • Name: ${interaction.guild.name}
                    • ID: ${interaction.guild.id}
                    • Pref Locale: ${interaction.guild.preferredLocale}
                    • Creation date: ${interaction.guild.createdAt.toLocaleString()}
                    • Members: ${formatNumber(interaction.guild.memberCount)}
                    • Roles: ${interaction.guild.roles.cache.size}
                    • Verification level: ${interaction.guild.verificationLevel}
                    • Boosts: ${boostcount}
                    • Emojis: ${interaction.guild.emojis.cache.size}`, false)
                .addField(`**~** Channels:`,
                    stripIndents`
                    • Categories: ${interaction.guild.channels.cache.filter(m => m.type === 'GUILD_CATEGORY').size}
                    • Text: ${interaction.guild.channels.cache.filter(m => m.type === 'GUILD_TEXT').size}
                    • Voice: ${interaction.guild.channels.cache.filter(m => m.type === 'GUILD_VOICE').size}`, false)
                .setFooter({ text: 'Rodger | 📋 Server info', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" })
                .setTimestamp()

            await interaction.reply({ embeds: [userEmbed] });

        } else if (interaction.options.getSubcommand() === "ping") {
            const msg = await interaction.reply(`Checking...`);
            await interaction.editReply(`Latency ${interaction.client.ws.ping}ms`);

        } else if (interaction.options.getSubcommand() === "invite") {
            const userEmbed = new MessageEmbed()
                .setColor('ORANGE')
                .setTitle("INVITE")
                .addField('**Here is my invite link!** ', `❤ ❤ [Add me!](https://discordapp.com/api/oauth2/authorize?client_id=664244372723728424&permissions=8&scope=bot) ❤ ❤`, false)
                .setTimestamp()
                .setFooter({ text: 'Rodger | ➕ Invite!', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" });
            await interaction.reply({ embeds: [userEmbed], ephemeral: true });

        } else if (interaction.options.getSubcommand() === "vote") {
            const userEmbed = new MessageEmbed()
                .setColor('ORANGE')
                .setTitle("VOTE")
                .addField('**Vote for me on top.gg!** ', `❤ ❤ [Vote!](https://top.gg/bot/664244372723728424/vote) ❤ ❤`, false)
                .setTimestamp()
                .setFooter({ text: 'Rodger | 👍 Vote!', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" });
            await interaction.reply({ embeds: [userEmbed], ephemeral: true });

        } else if
            (interaction.options.getSubcommand() === "pfp") {
            const user = interaction.options.getUser("target");
            if (user) {
                const member = interaction.options.getMember("target");
                const roles = member.roles
                    .cache.filter(r => r.id !== interaction.guild.id)
                    .map(r => r)
                    .join(", ") || "none";
                const userEmbed = new MessageEmbed()
                    .setTitle("PFP")
                    .setImage(member.displayAvatarURL())
                    .setColor(member.displayHexColor)
                    .setDescription(`**Here is the pfp of ${member.displayName}.**`, false)
                    .setTimestamp()
                    .setFooter({ text: 'Rodger | 🐹 AVATAR!', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" });

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

                    const userEmbed = new MessageEmbed()
                        .setTitle("STATS")
                        .setColor("ORANGE")
                        .addField('**~** Uptime', `${uptime}`, false)
                        .addField('**~** Memory Usage', `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, false)
                        .addField('**~** General Stats',
                            stripIndents`
				• Servers: ${formatNumber(totalGuilds)}
				• Channels: ${formatNumber(interaction.client.channels.cache.size)}
                • Users: ${formatNumber(totalMembers)}
                • Latency: ${interaction.client.ws.ping}ms
                • Shards: ${interaction.client.shard.count}
                • Shard ID: ${interaction.guild.shard.id}`,
                            false)

                        .setFooter({ text: 'Rodger | 💾 Stats', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" })
                        .setTimestamp()

                        return interaction.reply({ embeds: [userEmbed] });
                })

        } else {

            await interaction.reply("no subcommand was used.");
        }
    },
};
