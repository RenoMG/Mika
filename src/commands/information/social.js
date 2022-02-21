const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageEmbed } = require('discord.js');
const { stripIndents } = require("common-tags");
const moment = require("moment");
require("moment-duration-format");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('social')
        .setDescription('Social based commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName("dab")
                .setDescription("Dabs on mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("stare")
                .setDescription("Stares at mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned."))),
    async execute(interaction, message, client) {
        if (interaction.options.getSubcommand() === "dab") {
            const user = interaction.options.getUser("target");
            if (user) {
                const member = interaction.options.getMember("target");
                var options = ['https://media1.tenor.com/images/a13b0377304f6d5ccb3e393528d7799f/tenor.gif?itemid=5661979',
                    'https://media1.tenor.com/images/3be662d17dcdae3aa7891b949a8fbc1d/tenor.gif?itemid=5044603',
                    'https://media1.tenor.com/images/4f0a48e9ca005beb43e9a1f23eba01b5/tenor.gif?itemid=11976669',
                    'https://media1.tenor.com/images/757d1de1f3d03ae059d6fcf650b178dc/tenor.gif?itemid=8226660',
                    'https://media1.tenor.com/images/058562637a5a10b22224967eee845b21/tenor.gif?itemid=10913292',
                    'https://media1.tenor.com/images/1401f4c05b2e2787cfa5b0cd17538690/tenor.gif?itemid=9229974',
                    'https://media1.tenor.com/images/6ffa13b8ce8e8d112a368ef688f6cc99/tenor.gif?itemid=15118193',
                    'https://media1.tenor.com/images/995a7f5954f85ef43bd32fba9da292a0/tenor.gif?itemid=10107480',
                    'https://media1.tenor.com/images/4635ee263fa1eb82770d875f3ae8d2ba/tenor.gif?itemid=13464286',
                    'https://media1.tenor.com/images/aad47489a4597fbfb23d9da7f3ee6919/tenor.gif?itemid=5407707',
                    'https://media1.tenor.com/images/9a1e93af9076620cde71b259accd1a04/tenor.gif?itemid=10027244',
                    'https://media1.tenor.com/images/8d0a3ecfe494c6cebf30e4a8840c000c/tenor.gif?itemid=12629395',
                    'https://media1.tenor.com/images/cb22bf6841776de64bececb7a78372bc/tenor.gif?itemid=5656335',
                    'https://media1.tenor.com/images/82c12f09b13e36d5b7e93d8edc9a46ed/tenor.gif?itemid=8108584',
                    'https://media1.tenor.com/images/20b965c738f8832b54ca2441fedba027/tenor.gif?itemid=10833320',
                    'https://media1.tenor.com/images/e507b0b023b53aa6dc6fe33f17030811/tenor.gif?itemid=15546969',
                    'https://media1.tenor.com/images/e7aba55f5552cfd7fe82d18b9a0443f3/tenor.gif?itemid=15729254',
                    'https://media1.tenor.com/images/3d9c86a0152b496515fed3a8735000d2/tenor.gif?itemid=7699390'];

                var response = options[Math.floor(Math.random() * options.length)];

                var sayings = ["Oof",
                    "Lol",
                    "They had it coming!",
                    "",
                    "HA!",
                    "Mean!!",
                    "Oh thats cold.",
                    "😂"];

                var sayingsdat = sayings[Math.floor(Math.random() * sayings.length)];

                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setImage(response)
                    .setURL(response)
                    .setTimestamp()
                    .setDescription(`**${interaction.member.user} dabs on ${member}! ${sayingsdat}**`)
                    .setFooter({ text: 'Rodger | 😲 DAB!', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png" });

                await interaction.reply({ embeds: [userEmbed] });
            }

        } else if (interaction.options.getSubcommand() === "stare") {
            const user = interaction.options.getUser("target");
            if (user) {
                const member = interaction.options.getMember("target");
                var options = ['https://media.tenor.com/images/d1ae46518951c8f43fb0c13bee6e781f/tenor.gif',
                    'https://media.tenor.com/images/2d26a8df268c0f781a0ac5d074952680/tenor.gif',
                    'https://media.tenor.com/images/d3d360a243ace5f22a690f829b4f934f/tenor.gif',
                    'https://media.tenor.com/images/d6c2f78be75331b83516a77bbcee916d/tenor.gif',
                    'https://media.tenor.com/images/a87a35975f8219543739eb82eda8e290/tenor.gif',
                    'https://media.tenor.com/images/fd01718662c9158933c16a6e328bcb6f/tenor.gif',
                    'https://media.tenor.com/images/e75280af41a824e9b8d29ea11a43a399/tenor.gif',
                    'https://media.tenor.com/images/a3f9605080b201c54a7f1da094459094/tenor.gif',
                    'https://media.tenor.com/images/8264010d1b636f7106de54475691ea84/tenor.gif',
                    'https://media.tenor.com/images/fb7d694a9952f13f8399abca62c744f4/tenor.gif',
                    'https://media.tenor.com/images/4a3b268a6ea41b447df0848e4af2dc39/tenor.gif',
                    'https://media.tenor.com/images/aebc96e8c1fe388d16e2c4dc6d9f9c3a/tenor.gif',
                    'https://media.tenor.com/images/9ded206d68a4deaf44b64e1f0be44dc1/tenor.gif',
                    'https://media.tenor.com/images/e3fe5b83330d7505ac6ce9e8d0ccc2a1/tenor.gif',
                    'https://media.tenor.com/images/a01df54c033d090533f81b62b5f12106/tenor.gif',
                    'https://media.tenor.com/images/9f31232b930edf119332b22d6653f4f5/tenor.gif',
                    'https://media.tenor.com/images/b3573dbe2ef0d8dabcec0fc8ffa8154e/tenor.gif',
                    'https://media.tenor.com/images/5f96bfb5a80bc16ee2f55b45538df5bc/tenor.gif',
                    'https://media.tenor.com/images/4c5f1f25624ffd35e8c86325c2d109e6/tenor.gif',
                    'https://media.tenor.com/images/bc321913b683c0d66a31d99a0e418ada/tenor.gif',
                    'https://media.tenor.com/images/e34a1095a5b42c255073b9b0e954fc5d/tenor.gif',
                    'https://media.tenor.com/images/46e5c9081c0ac61dbe751aff12b48b21/tenor.gif'];

                var response = options[Math.floor(Math.random() * options.length)];

                const embed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setImage(response)
                    .setURL(response)
                    .setTimestamp()
                    .setDescription(`**${interaction.member.user} stares at ${message.author}.**`)
                    .setFooter({ text: 'Rodger | 😶 STARE!', iconURL: "https://cdn.discordapp.com/avatars/664244372723728424/5180b5959d6e7c00639100a46c2b213b.png"});

                await interaction.reply({ embeds: [userEmbed] });
            }

            } else {

                await interaction.reply("no subcommand was used.");
            }
        },
    };
