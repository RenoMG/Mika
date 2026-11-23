const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
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
        .addSubcommand((subcommand) => subcommand
            .setName('welcome')
            .setDescription('Change greeting and farewell settings.'))
        .addSubcommand((subcommand) => subcommand
            .setName('command')
            .setDescription('Change command groups and restricted channels.'))
        .addSubcommand((subcommand) => subcommand
            .setName('info')
            .setDescription('Shows all current server settings.'))
        .addSubcommand((subcommand) => subcommand
            .setName('logging')
            .setDescription('Change logging settings.'))
        .addSubcommand((subcommand) => subcommand
            .setName('autorole')
            .setDescription('Change the auto-role.'))
        .addSubcommand((subcommand) => subcommand
            .setName('muterole')
            .setDescription('Change the mute role.'))
        .addSubcommand((subcommand) => subcommand
            .setName('leveling')
            .setDescription('Change level-up settings.')),
    PermissionFlagsBits.ManageGuild),
    category: 'configuration',
    checkDisabledChannels: true,
    permissions: [PermissionFlagsBits.ManageGuild],
    botPermissions: [PermissionFlagsBits.ManageGuild],
    example: '/config info',
    examples: {
        welcome: '/config welcome — Greeting message. {user}=mention, {userd}=display name',
        command: '/config command',
        info: '/config info',
        logging: '/config logging',
        autorole: '/config autorole',
        muterole: '/config muterole',
        leveling: '/config leveling — Level-up message. {user}=mention, {userd}=display name, {level}=level. Type default to reset',
    },
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const handler = handlers[sub];
        if (!handler) return;
        return handler(interaction);
    },
};
