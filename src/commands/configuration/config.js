const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const welcome = require('./handlers/welcome');
const command = require('./handlers/command');
const info = require('./handlers/info');
const logging = require('./handlers/logging');
const autorole = require('./handlers/autorole');
const muterole = require('./handlers/muterole');
const leveling = require('./handlers/leveling');

const handlers = {
    welcome,
    command,
    info,
    logging,
    autorole,
    muterole,
    leveling,
};

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('config')
        .setDescription('Server configuration management.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('welcome')
                .setDescription('Greeting and Farewell config')
                .addChannelOption(option => option.setName("gchannel").addChannelTypes(ChannelType.GuildText).setDescription("Set the channel for greeting messages."))
                .addChannelOption(option => option.setName("fchannel").addChannelTypes(ChannelType.GuildText).setDescription("Set the channel for farewell messages."))
                .addStringOption(option => option.setName("greeting").setDescription("Enable or Disable greeting").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("farewell").setDescription("Enable or Disable farewell").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("gmessage").setDescription("Greeting text. {user}=mention, {userd}=display name."))
                .addStringOption(option => option.setName("fmessage").setDescription("Farewell text. {user}=mention, {userd}=display name.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('command')
                .setDescription('Command status config')
                .addStringOption(option => option.setName("moderation").setDescription("Enable or disable moderation commands.").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("meme").setDescription("Enable or disable meme commands.").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("information").setDescription("Enable or disable information commands.").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("social").setDescription("Enable or disable social commands.").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("image").setDescription("Enable or disable image commands.").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addChannelOption(option => option.setName("achannel").addChannelTypes(ChannelType.GuildText).setDescription("Add channel to restric commands in."))
                .addChannelOption(option => option.setName("rchannel").addChannelTypes(ChannelType.GuildText).setDescription("Remove channel from having command restricted.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('Shows all current server settings.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('logging')
                .setDescription('Logging config')
                .addStringOption(option => option.setName("status").setDescription("Enable or disable logging").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addChannelOption(option => option.setName("channel").addChannelTypes(ChannelType.GuildText).setDescription("Set channel for logs to be sent to.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('autorole')
                .setDescription('Auto-Role config')
                .addStringOption(option => option.setName("status").setDescription("Enable or disable auto-role").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addRoleOption(option => option.setName("role").setDescription("Set auto-role to give to new users.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('muterole')
                .setDescription('Mute-role config')
                .addRoleOption(option => option.setName("role").setDescription("Set role to give to muted users.")))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leveling')
                .setDescription('leveling config')
                .addStringOption(option => option.setName("status").setDescription("Enable or disable leveling").addChoices({ name: "Enable", value: "true" }).addChoices({ name: "Disable", value: "false" }))
                .addStringOption(option => option.setName("message").setDescription("Level-up text. {user}=mention, {userd}=display name, {level}. Use default to reset."))
                .addChannelOption(option => option.setName("channel").addChannelTypes(ChannelType.GuildText).setDescription("Set channel for level up messages to be sent to."))),
    PermissionFlagsBits.BanMembers),
    category: 'configuration',
    checkDisabledChannels: true,
    permissions: [PermissionFlagsBits.BanMembers],
    example: '/config command moderation:Disable',
    examples: {
        welcome: '/config welcome gmessage:Welcome {user} ({userd})! — {user}=mention, {userd}=display name',
        command: '/config command moderation:Disable',
        info: '/config info',
        logging: '/config logging status:Enable channel:#channel',
        autorole: '/config autorole status:Enable role:@role',
        muterole: '/config muterole role:@role',
        leveling: '/config leveling message:{user} ({userd}) reached {level} — {user}=mention, {userd}=display name, {level}=level. message:default resets',
    },
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const handler = handlers[sub];
        if (!handler) return;
        return handler(interaction);
    },
};
