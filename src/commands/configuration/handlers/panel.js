const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    Colors,
    EmbedBuilder,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { allowedMentions } = require('../../../utils/mentions');
const { redact } = require('../../../utils/redact');
const { isQuietError } = require('../../../utils/interactionErrors');
const { isDefaultRequest } = require('../../../utils/formatMessage');
const { embedForSection } = require('./info');
const {
    channelIdFrom,
    listValues,
    loadConfig,
    pullKeyed,
    pushKeyed,
    setKeyed,
    setStatus,
} = require('./configFields');

const PANEL_TIMEOUT_MS = 120000;
const TEXT_MAX = 1000;
const GENERIC_ERROR = 'There was an error while executing this command!';
const ONLY_OWNER = 'Only the person who opened this menu can use it.';
const NEED_MANAGE = 'You need Manage Server to change these settings.';
const SERVER_ONLY = 'This menu only works in a server.';
const STALE = 'That control is no longer valid.';
const EXPIRED = 'This menu expired.';
const CANNOT_ACCESS = '❌ I cannot access that role!';
const TOO_LONG = `That message is too long. Keep it to ${TEXT_MAX} characters.`;
const GREETING_HINT = '{user}=mention, {userd}=display name';
const LEVEL_HINT = '{user}=mention, {userd}=display name, {level}=level. Type default to reset';

const ACTIONS = new Set(['menu', 'back', 'on', 'off', 'channel', 'role', 'modal']);

// One list drives every section. custom ids only name the section, field, and
// opener so a click can be routed. The new value always comes from the control.
const FIELDS = {
    welcome: [
        { id: 'gchannel', label: 'Greeting message channel', kind: 'channel', key: 'GreetingChannel' },
        { id: 'fchannel', label: 'Farewell message channel', kind: 'channel', key: 'FarewellChannel' },
        { id: 'gmessage', label: 'Greeting message', kind: 'text', key: 'GreetingMessage', max: TEXT_MAX, placeholder: GREETING_HINT },
        { id: 'fmessage', label: 'Farewell message', kind: 'text', key: 'FarewellMessage', max: TEXT_MAX, placeholder: GREETING_HINT },
        { id: 'greeting', label: 'Greeting on/off', kind: 'toggle', key: 'GreetingStatus' },
        { id: 'farewell', label: 'Farewell on/off', kind: 'toggle', key: 'FarewellStatus' },
    ],
    commands: [
        { id: 'moderation', label: 'Moderation on/off', kind: 'toggle', key: 'ModerationCommandStatus' },
        { id: 'meme', label: 'Meme on/off', kind: 'toggle', key: 'MemeCommandStatus' },
        { id: 'information', label: 'Information on/off', kind: 'toggle', key: 'InfoCommandStatus' },
        { id: 'social', label: 'Social on/off', kind: 'toggle', key: 'SocialCommandStatus' },
        { id: 'image', label: 'Image on/off', kind: 'toggle', key: 'ImageCommandStatus' },
        { id: 'addchannel', label: 'Add restricted channel', kind: 'channel-add', key: 'DisabledChannels' },
        { id: 'removechannel', label: 'Remove restricted channel', kind: 'channel-remove', key: 'DisabledChannels' },
    ],
    logging: [
        { id: 'status', label: 'Logging on/off', kind: 'toggle', key: 'LoggingStatus' },
        { id: 'channel', label: 'Logging channel', kind: 'channel', key: 'LoggingChannel' },
    ],
    autorole: [
        { id: 'status', label: 'Auto-role on/off', kind: 'toggle', key: 'AutoroleStatus' },
        { id: 'role', label: 'Auto-role role', kind: 'role', key: 'AutoroleRole' },
    ],
    muterole: [
        { id: 'role', label: 'Mute role', kind: 'role', key: 'Muterole', checkEditable: true },
    ],
    leveling: [
        { id: 'status', label: 'Leveling on/off', kind: 'toggle', key: 'LevelingCommandStatus' },
        { id: 'message', label: 'Level-up message', kind: 'text', key: 'Levelupmessage', max: TEXT_MAX, placeholder: LEVEL_HINT, reset: true },
        { id: 'channel', label: 'Level-up channel', kind: 'channel', key: 'Levelupchannel' },
    ],
};

const SECTION_BY_SUB = {
    welcome: 'welcome',
    command: 'commands',
    logging: 'logging',
    autorole: 'autorole',
    muterole: 'muterole',
    leveling: 'leveling',
};

const openUntil = new Map();

function controlId(action, sectionId, fieldId, userId) {
    return `cfg:${action}:${sectionId}:${fieldId}:${userId}`;
}

function actionFits(field, action) {
    if (action === 'on' || action === 'off') return field.kind === 'toggle';
    if (action === 'channel') return field.kind === 'channel' || field.kind === 'channel-add' || field.kind === 'channel-remove';
    if (action === 'role') return field.kind === 'role';
    if (action === 'modal') return field.kind === 'text';
    return false;
}

function parseId(customId) {
    if (typeof customId !== 'string') return null;
    const parts = customId.split(':');
    if (parts.length !== 5 || parts[0] !== 'cfg') return null;
    const action = parts[1];
    const section = parts[2];
    const fieldId = parts[3];
    const userId = parts[4];
    if (!ACTIONS.has(action) || !Object.prototype.hasOwnProperty.call(FIELDS, section)) return null;
    if (!/^\d{17,20}$/.test(userId)) return null;
    if (action === 'menu' || action === 'back') {
        if (fieldId !== '-') return null;
        return { action, section, field: null, userId };
    }
    if (!/^[a-z]{1,32}$/.test(fieldId)) return null;
    const field = FIELDS[section].find((entry) => entry.id === fieldId);
    if (!field || !actionFits(field, action)) return null;
    return { action, section, field, userId };
}

function isConfigComponentId(customId) {
    return typeof customId === 'string' && customId.startsWith('cfg:') && !customId.startsWith('cfg:modal:');
}

function isConfigModalId(customId) {
    return typeof customId === 'string' && customId.startsWith('cfg:modal:');
}

function userIdOf(interaction) {
    const user = interaction && interaction.user;
    if (!user || typeof user.id !== 'string' || !user.id) return null;
    return user.id;
}

function serverId(interaction) {
    const guild = interaction && interaction.guild;
    if (!guild || typeof guild.id !== 'string' || !guild.id) return null;
    return guild.id;
}

function canManage(interaction) {
    const member = interaction && interaction.member;
    const perms = member && member.permissions;
    if (!perms || typeof perms.has !== 'function') return false;
    try {
        return perms.has(PermissionFlagsBits.ManageGuild) === true;
    } catch (error) {
        return false;
    }
}

function markOpen(messageId) {
    if (!messageId) return;
    openUntil.set(messageId, Date.now() + PANEL_TIMEOUT_MS);
}

function viewOptions(interaction) {
    const messageId = interaction && interaction.message && interaction.message.id;
    if (!messageId || !openUntil.has(messageId)) return {};
    const until = openUntil.get(messageId);
    if (typeof until === 'number' && Date.now() < until) return {};
    return { disabled: true, expired: true };
}

function currentText(data, field) {
    const values = listValues(data && data[field.key], 'Message');
    return values.length ? String(values[0]) : '';
}

function stringMenu(sectionId, userId, disabled) {
    return new StringSelectMenuBuilder()
        .setCustomId(controlId('menu', sectionId, '-', userId))
        .setPlaceholder('Choose a setting')
        .setDisabled(Boolean(disabled))
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(FIELDS[sectionId].map((field) => ({
            label: field.label,
            value: field.id,
        })));
}

function overviewView(data, sectionId, userId, options = {}) {
    const embed = embedForSection(data, sectionId);
    const payload = {
        embeds: embed ? [embed] : [],
        components: [new ActionRowBuilder().addComponents(stringMenu(sectionId, userId, options.disabled))],
        allowedMentions: allowedMentions(),
    };
    if (options.expired) payload.content = EXPIRED;
    return payload;
}

function backButton(sectionId, userId) {
    return new ButtonBuilder()
        .setCustomId(controlId('back', sectionId, '-', userId))
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);
}

function promptView(data, sectionId, field, userId) {
    const embed = embedForSection(data, sectionId);
    const payload = {
        embeds: embed ? [embed] : [],
        allowedMentions: allowedMentions(),
    };
    if (field.kind === 'toggle') {
        const enable = new ButtonBuilder()
            .setCustomId(controlId('on', sectionId, field.id, userId))
            .setLabel('Enable')
            .setStyle(ButtonStyle.Success);
        const disable = new ButtonBuilder()
            .setCustomId(controlId('off', sectionId, field.id, userId))
            .setLabel('Disable')
            .setStyle(ButtonStyle.Danger);
        payload.components = [new ActionRowBuilder().addComponents(enable, disable, backButton(sectionId, userId))];
        return payload;
    }
    let menu;
    if (field.kind === 'role') {
        menu = new RoleSelectMenuBuilder()
            .setCustomId(controlId('role', sectionId, field.id, userId))
            .setPlaceholder('Choose a role')
            .setMinValues(1)
            .setMaxValues(1);
    } else {
        menu = new ChannelSelectMenuBuilder()
            .setCustomId(controlId('channel', sectionId, field.id, userId))
            .setPlaceholder('Choose a text channel')
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(1)
            .setMaxValues(1);
    }
    payload.components = [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(backButton(sectionId, userId)),
    ];
    return payload;
}

function buildTextModal(sectionId, field, current, userId) {
    const input = new TextInputBuilder()
        .setCustomId('text')
        .setLabel(field.label.slice(0, 45))
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(field.max)
        .setPlaceholder(field.placeholder.slice(0, 100));
    const prefill = typeof current === 'string' ? current.slice(0, field.max) : '';
    if (prefill.length > 0) input.setValue(prefill);
    return new ModalBuilder()
        .setCustomId(controlId('modal', sectionId, field.id, userId))
        .setTitle(field.label.slice(0, 45))
        .addComponents(new ActionRowBuilder().addComponents(input));
}

function cannotAccessEmbed() {
    return new EmbedBuilder().setColor(Colors.Red).setDescription(CANNOT_ACCESS);
}

async function safeReply(interaction, contentOrPayload) {
    const payload = typeof contentOrPayload === 'string' ? { content: contentOrPayload } : { ...contentOrPayload };
    payload.flags = MessageFlags.Ephemeral;
    payload.allowedMentions = allowedMentions();
    try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

async function safeUpdate(interaction, payload) {
    try {
        await interaction.update({ ...payload, allowedMentions: allowedMentions() });
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

function guard(interaction, parsed) {
    const userId = userIdOf(interaction);
    if (!parsed) return { error: STALE };
    if (!userId || userId !== parsed.userId) return { error: ONLY_OWNER };
    if (!serverId(interaction)) return { error: SERVER_ONLY };
    if (!canManage(interaction)) return { error: NEED_MANAGE };
    return { userId, guildId: serverId(interaction) };
}

function pickedChannel(interaction) {
    const resolved = interaction.channels && typeof interaction.channels.first === 'function'
        ? interaction.channels.first()
        : null;
    if (resolved) {
        if (resolved.type != null && resolved.type !== ChannelType.GuildText) return { error: 'Pick a text channel.' };
        const id = channelIdFrom(resolved);
        if (!id) return { error: 'Pick a text channel.' };
        return { id };
    }
    const values = Array.isArray(interaction.values) ? interaction.values : [];
    if (values.length === 1 && typeof values[0] === 'string' && /^\d{17,20}$/.test(values[0])) return { id: values[0] };
    return { error: 'Pick a text channel.' };
}

function pickedRole(interaction) {
    const resolved = interaction.roles && typeof interaction.roles.first === 'function'
        ? interaction.roles.first()
        : null;
    if (resolved && resolved.id) return resolved;
    const values = Array.isArray(interaction.values) ? interaction.values : [];
    if (values.length === 1 && typeof values[0] === 'string' && /^\d{17,20}$/.test(values[0])) return { id: values[0] };
    return null;
}

function applyText(data, field, raw) {
    if (typeof raw !== 'string') return { error: 'Send some text.' };
    if (field.reset && isDefaultRequest(raw)) {
        setKeyed(data, field.key, 'Message', '');
        return { ok: true };
    }
    if (raw.length > field.max) return { error: TOO_LONG };
    setKeyed(data, field.key, 'Message', raw);
    return { ok: true };
}

async function showOverview(interaction, guildId, section, userId) {
    const fresh = await loadConfig(guildId);
    await safeUpdate(interaction, overviewView(fresh, section, userId, viewOptions(interaction)));
}

async function routeMenu(interaction, parsed, guildId) {
    const choice = Array.isArray(interaction.values) ? interaction.values[0] : null;
    const field = FIELDS[parsed.section].find((entry) => entry.id === choice);
    if (!field) {
        await safeReply(interaction, STALE);
        return;
    }
    const data = await loadConfig(guildId);
    if (field.kind === 'text') {
        const modal = buildTextModal(parsed.section, field, currentText(data, field), parsed.userId);
        try {
            await interaction.showModal(modal);
        } catch (error) {
            if (!isQuietError(error)) throw error;
        }
        return;
    }
    await safeUpdate(interaction, promptView(data, parsed.section, field, parsed.userId));
}

async function routeComponent(interaction) {
    const parsed = parseId(interaction && interaction.customId);
    const access = guard(interaction, parsed);
    if (access.error) {
        await safeReply(interaction, access.error);
        return;
    }
    if (parsed.action === 'menu') {
        await routeMenu(interaction, parsed, access.guildId);
        return;
    }
    if (parsed.action === 'back') {
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'on' || parsed.action === 'off') {
        const data = await loadConfig(access.guildId);
        setStatus(data, parsed.field.key, parsed.action === 'on' ? 'true' : 'false');
        await data.save();
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'channel') {
        const picked = pickedChannel(interaction);
        if (!picked.id) {
            await safeReply(interaction, picked.error);
            return;
        }
        const data = await loadConfig(access.guildId);
        if (parsed.field.kind === 'channel-add') pushKeyed(data, parsed.field.key, 'Channels', picked.id);
        else if (parsed.field.kind === 'channel-remove') pullKeyed(data, parsed.field.key, 'Channels', picked.id);
        else setKeyed(data, parsed.field.key, 'Channel', picked.id);
        await data.save();
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'role') {
        const role = pickedRole(interaction);
        if (!role) {
            await safeReply(interaction, 'Pick a role.');
            return;
        }
        if (parsed.field.checkEditable && !role.editable) {
            await safeReply(interaction, { embeds: [cannotAccessEmbed()] });
            return;
        }
        const data = await loadConfig(access.guildId);
        setKeyed(data, parsed.field.key, 'Role', role.id);
        await data.save();
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
    }
}

async function handleConfigComponent(interaction) {
    try {
        await routeComponent(interaction);
    } catch (error) {
        if (isQuietError(error)) return;
        console.error(redact(error));
        try {
            await safeReply(interaction, GENERIC_ERROR);
        } catch (replyError) {
            if (!isQuietError(replyError)) console.error(redact(replyError));
        }
    }
}

async function routeModal(interaction) {
    const parsed = parseId(interaction && interaction.customId);
    const access = guard(interaction, parsed && parsed.action === 'modal' ? parsed : null);
    if (access.error) {
        await safeReply(interaction, access.error);
        return;
    }
    if (!interaction.fields || typeof interaction.fields.getTextInputValue !== 'function') {
        await safeReply(interaction, 'Send some text.');
        return;
    }
    let raw;
    try {
        raw = interaction.fields.getTextInputValue('text');
    } catch (error) {
        await safeReply(interaction, 'Send some text.');
        return;
    }
    const data = await loadConfig(access.guildId);
    const result = applyText(data, parsed.field, raw);
    if (result.error) {
        await safeReply(interaction, result.error);
        return;
    }
    await data.save();
    if (typeof interaction.update === 'function') {
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    await safeReply(interaction, 'Saved.');
}

async function handleConfigModal(interaction) {
    try {
        await routeModal(interaction);
    } catch (error) {
        if (isQuietError(error)) return;
        console.error(redact(error));
        try {
            await safeReply(interaction, GENERIC_ERROR);
        } catch (replyError) {
            if (!isQuietError(replyError)) console.error(redact(replyError));
        }
    }
}

async function openPanel(interaction, subName) {
    const sectionId = SECTION_BY_SUB[subName];
    if (!sectionId) return;
    const userId = userIdOf(interaction);
    const guildId = serverId(interaction);
    if (!userId || !guildId) {
        await safeReply(interaction, SERVER_ONLY);
        return;
    }
    if (!canManage(interaction)) {
        await safeReply(interaction, NEED_MANAGE);
        return;
    }
    const data = await loadConfig(guildId);
    const response = await interaction.reply({
        ...overviewView(data, sectionId, userId),
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
        withResponse: true,
    });
    const message = response && response.resource && response.resource.message
        ? response.resource.message
        : (typeof interaction.fetchReply === 'function' ? await interaction.fetchReply() : null);
    if (message && message.id) markOpen(message.id);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return response;

    const collector = message.createMessageComponentCollector({ time: PANEL_TIMEOUT_MS });
    collector.on('end', async () => {
        if (message.id) openUntil.set(message.id, 0);
        try {
            const fresh = await loadConfig(guildId);
            await interaction.editReply(overviewView(fresh, sectionId, userId, { disabled: true, expired: true }));
        } catch (error) {
            // The ephemeral message can already be gone, or Discord answered 10062/40060.
        }
    });
    return response;
}

module.exports = {
    PANEL_TIMEOUT_MS,
    TEXT_MAX,
    ONLY_OWNER,
    NEED_MANAGE,
    SERVER_ONLY,
    STALE,
    EXPIRED,
    CANNOT_ACCESS,
    TOO_LONG,
    GREETING_HINT,
    LEVEL_HINT,
    FIELDS,
    SECTION_BY_SUB,
    overviewView,
    buildTextModal,
    parseId,
    isConfigComponentId,
    isConfigModalId,
    openPanel,
    handleConfigComponent,
    handleConfigModal,
};
