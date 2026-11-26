// Right-click a member → Apps. Quicker than typing a slash command and
// something Discord's own member menu can't do.
const {
    ActionRowBuilder,
    ApplicationCommandType,
    ContextMenuCommandBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { evaluateCommandGates } = require('../../utils/commandGates');
const guildConfig = require('../../utils/getGuildConfig');
const mod = require('../../utils/moderation');
const warn = require('./warn');
const { showInfractions } = require('./infractions');

const WARN_MODAL_PREFIX = 'modapp:warn:';

function targetOf(interaction) {
    const member = interaction.targetMember || null;
    const user = interaction.targetUser || (member && member.user) || null;
    return { user, member };
}

const warnApp = {
    data: applySlashDefaults(new ContextMenuCommandBuilder()
        .setName('Warn')
        .setType(ApplicationCommandType.User),
    PermissionFlagsBits.KickMembers),
    description: 'Warns a member. A form asks for the reason.',
    example: 'Right-click a member → Apps → Warn',
    category: 'moderation',
    replies: 'public',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [],
    // The form has to be the first response, so the reply is not deferred.
    // The category and channel settings are checked again when it is sent.
    opensModal: true,
    precheck: (interaction) => warn.checkTarget(interaction, targetOf(interaction).member),
    async execute(interaction) {
        const { member } = targetOf(interaction);
        const name = String(member.displayName || (member.user && member.user.username) || 'member').slice(0, 30);
        const reason = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(mod.REASON_MAX)
            .setPlaceholder('What did they do?');
        return interaction.showModal(new ModalBuilder()
            .setCustomId(`${WARN_MODAL_PREFIX}${member.id}`)
            .setTitle(`Warn ${name}`)
            .addComponents(new ActionRowBuilder().addComponents(reason)));
    },
};

function isWarnModal(customId) {
    return typeof customId === 'string' && customId.startsWith(WARN_MODAL_PREFIX);
}

async function handleWarnModal(interaction) {
    try {
        if (!interaction.guild) return null;
        const targetId = mod.snowflake(interaction.customId.slice(WARN_MODAL_PREFIX.length));
        const memberHas = Boolean(interaction.member && interaction.member.permissions
            && interaction.member.permissions.has(warnApp.permissions));
        const parsed = mod.reasonFrom(interaction.fields.getTextInputValue('reason'));
        const early = evaluateCommandGates({ command: warnApp, config: null, channelId: null, memberHas, botHas: true })
            || (parsed.error ? mod.ephemeral(parsed.error) : null)
            || (targetId ? null : mod.ephemeral(mod.HIERARCHY.missing));
        if (early) return finish(interaction, early);

        await defer(interaction);
        const config = await guildConfig.getGuildConfig(interaction.guild.id, { readOnly: true });
        const channelId = interaction.channelId || (interaction.channel && interaction.channel.id);
        const gate = evaluateCommandGates({ command: warnApp, config, channelId, memberHas: true, botHas: true });
        if (gate) return finish(interaction, gate);
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        const block = warn.checkTarget(interaction, member);
        if (block) return finish(interaction, mod.ephemeral(block));
        return await warn.warnMember(interaction, member, parsed.reason);
    } catch (error) {
        return mod.replyError(interaction, error, 'Warn app failed.');
    }
}

const infractionsApp = {
    data: applySlashDefaults(new ContextMenuCommandBuilder()
        .setName('Infractions')
        .setType(ApplicationCommandType.User),
    PermissionFlagsBits.KickMembers),
    description: "Shows a member's record, privately, with a menu to remove entries.",
    example: 'Right-click a member → Apps → Infractions',
    category: 'moderation',
    replies: 'private',
    configKey: 'ModerationCommandStatus',
    checkDisabledChannels: true,
    permissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [],
    async execute(interaction) {
        try {
            const { user, member } = targetOf(interaction);
            return await showInfractions(interaction, user, member);
        } catch (error) {
            return mod.replyError(interaction, error, 'Infractions app failed.');
        }
    },
};

module.exports = {
    WARN_MODAL_PREFIX,
    commands: [warnApp, infractionsApp],
    warnApp,
    infractionsApp,
    isWarnModal,
    handleWarnModal,
};
