const { SlashCommandBuilder } = require('@discordjs/builders');
const { Client, CommandInteraction, MessageEmbed, Permissions } = require('discord.js');
const { stripIndents } = require("common-tags");
const configurationDB = require("../../Models/ConfigurationDB");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('Server configuration management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('Greeting and Farewell config')
                .addChannelOption(option => option.setName("gchannel").setDescription("Set the channel for greeting messages."))
                .addChannelOption(option => option.setName("fchannel").setDescription("Set the channel for farewell messages."))
                .addStringOption(option => option.setName("greeting").setDescription("Enable or Disable greeting").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("farewell").setDescription("Enable or Disable farewell").addChoice("Enable", "true").addChoice("Disable", "false"))
                .addStringOption(option => option.setName("gmessage").setDescription("Set the greeting message."))
                .addStringOption(option => option.setName("fmessage").setDescription("Set the farewell message."))),
    permissions: [Permissions.FLAGS.BAN_MEMBERS],

    async execute(interaction, client) {
        const Sub = interaction.options.getSubcommand(["add", "remove"])
        const gChannel = interaction.options.getChannel("gchannel");
        const fChannel = interaction.options.getChannel("fchannel");
        const greetingO = interaction.options.getString("greeting");
        const farewellO = interaction.options.getString("farewell");
        const gMessage = interaction.options.getString("gmessage");
        const fMessage = interaction.options.getString("fmessage");

        if (Sub === 'welcome') {

            if (gChannel === null && fChannel === null && greetingO === null && farewellO === null && gMessage === null && fMessage === null) {
                return interaction.reply(`Nothing was changed!`);
            } else {
                configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                    if (err) throw err;
                    if (!data) {
                        data = new configurationDB({
                            GuildID: interaction.guildId,
                            GreetingChannel: [
                                {
                                    Channel: stripChannel1
                                }
                            ],
                            FarewellChannel: [
                                {
                                    Channel: stripChannel2
                                }
                            ],
                            GreetingMessage: [
                                {
                                    Message: gMessage
                                }
                            ],
                            FarewellMessage: [
                                {
                                    Message: fMessage
                                }
                            ],
                            GreetingStatus: [
                                {
                                    Status: greetingO
                                }
                            ],
                            FarewellStatus: [
                                {
                                    Status: farewellO
                                }
                            ],
                        })
                    } else {
                        if (gChannel === null){

                        } else {
                            stripChannel1 = gChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                            data.GreetingChannel.splice(0, 1)
                            const obj = {
                                Channel: stripChannel1
                            }
                            data.GreetingChannel.push(obj)
                        }

                        if (fChannel === null){

                        } else {
                            stripChannel2 = fChannel.toString().replace(/</gi, "").replace(/>/gi, "").replace(/#/gi, "");
                            data.FarewellChannel.splice(0, 1)
                            const obj = {
                                Channel: stripChannel2
                            }
                            data.FarewellChannel.push(obj)
                        }

                        if (greetingO === null){

                        } else {
                            data.GreetingStatus.splice(0, 1)
                            const obj = {
                                Status: greetingO
                            }
                            data.GreetingStatus.push(obj)
                        }

                        if (farewellO === null){

                        } else {
                            data.FarewellStatus.splice(0, 1)
                            const obj = {
                                Status: farewellO
                            }
                            data.FarewellStatus.push(obj)
                        }

                        if (gMessage === null){

                        } else {
                            data.GreetingMessage.splice(0, 1)
                            const obj = {
                                Message: gMessage
                            }
                            data.GreetingMessage.push(obj)
                        }

                        if (fMessage === null){

                        } else {
                            data.FarewellMessage.splice(0, 1)
                            const obj = {
                                Message: fMessage
                            }
                            data.FarewellMessage.push(obj)
                        }
                    }
                        data.save()
                    interaction.reply(`Server config has been updated!`)
                });
            }

        } else if (Sub === 'farewell') {

            configurationDB.findOne({ GuildID: interaction.guildId }, async (err, data) => {
                if (err) throw err;
                if (!data) {
                    data = new configurationDB({
                        GuildID: interaction.guildId,
                        Farewell: [
                            {
                                Status: True
                            }
                        ],
                    })
                } else {
                    data.Farewell.splice(0, 1)
                    const obj = {
                        Status: FarewellMessage
                    }
                    data.Farewell.push(obj)
                }
                data.save()

                interaction.reply(`Your servers welccome message has been set to: **${FarewellMessage}**`)
            });
        }

    },
};
