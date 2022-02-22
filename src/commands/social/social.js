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
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("slap")
                .setDescription("Slaps mentioned user.")
                .addUserOption(option => option.setName("target").setRequired(true).setDescription("The user mentioned.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName("fbi")
                .setDescription("FBI OPEN UP!")),
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
                    .setFooter({ text: 'Rodger | 😲 DAB!', iconURL: `${process.env.RODGERICON}` });

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

                const userEmbed = new MessageEmbed()
                    .setColor("RANDOM")
                    .setImage(response)
                    .setURL(response)
                    .setTimestamp()
                    .setDescription(`**${interaction.member.user} stares at ${member}.**`)
                    .setFooter({ text: 'Rodger | 😶 STARE!', iconURL: `${process.env.RODGERICON}` });

                await interaction.reply({ embeds: [userEmbed] });
            }

        } else if (interaction.options.getSubcommand() === "slap") {
            const user = interaction.options.getUser("target");
            if (user) {
                const member = interaction.options.getMember("target");
                var options = ['https://media1.tenor.com/images/bc858e69d5022807b84554b2d4583c10/tenor.gif?itemid=5122019',
                    'https://media1.tenor.com/images/6a288821409733bb848f14b9443f8b73/tenor.gif?itemid=4079563',
                    'https://media1.tenor.com/images/204dc002cab486541636f163a73c796f/tenor.gif?itemid=10570690',
                    'https://media1.tenor.com/images/6aa432caad8e3272d21a68ead3629853/tenor.gif?itemid=4474446',
                    'https://media1.tenor.com/images/49796f431821592cafbdd97092347a00/tenor.gif?itemid=4207778',
                    'https://media1.tenor.com/images/0861f08d774be11c986629109c380a80/tenor.gif?itemid=11458265',
                    'https://media1.tenor.com/images/e7a1b07f02a2cbed51494b421e0b561f/tenor.gif?itemid=10742154',
                    'https://media1.tenor.com/images/4e113115b899d18f4a12f78a1557a1a2/tenor.gif?itemid=15051103',
                    'https://media1.tenor.com/images/b402a8e048dc9b092afaf886695b8d44/tenor.gif?itemid=14667643',
                    'https://media1.tenor.com/images/122fe52d4163b1c6d8ad2a00291ded86/tenor.gif?itemid=15652982',
                    'https://media1.tenor.com/images/14dc65890bf0cf98ac6fcd41f13f80b4/tenor.gif?itemid=14231834',
                    'https://media1.tenor.com/images/07829329a0581cdc77a8656b2cdbefbb/tenor.gif?itemid=15734086',
                    'https://media1.tenor.com/images/99ed477325a30d045b69170080e14e53/tenor.gif?itemid=15697214',
                    'https://media1.tenor.com/images/6e91abdfc6cbd901e5b57331977c5e69/tenor.gif?itemid=15960658',
                    'https://media1.tenor.com/images/555b9d6a60c6a24210696bcc5fab8a91/tenor.gif?itemid=15917737',
                    'https://media1.tenor.com/images/d68d5178ff2e372369ffefd8e1c0bac8/tenor.gif?itemid=16158933',
                    'https://media1.tenor.com/images/e685653e586d60991d640dc70559bbe9/tenor.gif?itemid=7075881',
                    'https://media1.tenor.com/images/7a2734bddb5e3f179195771c5cc48885/tenor.gif?itemid=16081425',
                    'https://media1.tenor.com/images/ff95aafec18f12777c59ec604a12edfa/tenor.gif?itemid=16108079'];

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
                    .setDescription(`**${interaction.member.user} slaps ${member}! ${sayingsdat}**`)
                    .setFooter({ text: 'Rodger | ✋ SLAP!', iconURL: `${process.env.RODGERICON}` });

                await interaction.reply({ embeds: [userEmbed] });
            }

        } else if (interaction.options.getSubcommand() === "fbi") {
            {
            var options = ['https://media1.tenor.com/images/30134f761730a93ae16df5e8096c7841/tenor.gif?itemid=15241150',
            'https://media1.tenor.com/images/b61a679b69018476724e494b6c06f51f/tenor.gif?itemid=13107377',
            'https://media1.tenor.com/images/2ea8696fa31f4037f55ecb77e70eedea/tenor.gif?itemid=13656344',
            'https://media1.tenor.com/images/bb86bf7dfe35b084932248ef53b6bf29/tenor.gif?itemid=14552703',
            'https://media1.tenor.com/images/3b0016a54369d03e1c81cc04465b8d77/tenor.gif?itemid=15524876',
            'https://media1.tenor.com/images/049d7634b324eabfcc231d60da63ce3e/tenor.gif?itemid=14018832',
            'https://media1.giphy.com/media/2Wkblpy4kuakM/giphy.gif?cid=790b76119d8582c54568cb2bfdd4385ac62fec1975a9838a&rid=giphy.gif',
            'https://media1.tenor.com/images/6b038a3cbb6b890d5d828b21153c593c/tenor.gif?itemid=4732785',
            'https://media1.tenor.com/images/3623cd420edaca64a2c92c0fff65f79f/tenor.gif?itemid=17235369',
            'https://media1.tenor.com/images/ea5b068eaf413109c2d44044e15419b7/tenor.gif?itemid=16928811',
            'https://media1.tenor.com/images/9a4e9faafd35f135ab35d4ade6b8ecf2/tenor.gif?itemid=16454147',
            'https://media1.tenor.com/images/4189be5b4e7164483297716bdfc4090c/tenor.gif?itemid=15337411',
            'https://media1.tenor.com/images/6bd7f2423275e8819566ff2441704472/tenor.gif?itemid=14223767']
      
          var response = options[Math.floor(Math.random() * options.length)];

            const userEmbed = new MessageEmbed()
              .setColor("RANDOM")
              .setImage(response)
              .setURL(response)
              .setTimestamp()
              .setDescription(`**FBI OPEN UP!**`)
              .setFooter({ text: 'Rodger | 👮 FBI!', iconURL: `${process.env.RODGERICON}` });

              await interaction.reply({ embeds: [userEmbed] });
            }

        } else {

            await interaction.reply("no subcommand was used.");
        }
    },
};
