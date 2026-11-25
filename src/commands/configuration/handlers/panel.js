const { roleAssignmentError } = require('../../../utils/roles');
const { finish: finishReply } = require('../../../utils/ack');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { defer, deferComponent, updateComponent, replyWithMessage } = require('../../../utils/ack');
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
const { GENERIC_ERROR } = require('../../../utils/messages');
const ONLY_OWNER = 'Only the person who opened this menu can use it.';
const NEED_MANAGE = 'You need Manage Server to change these settings.';
const SERVER_ONLY = 'This menu only works in a server.';
const STALE = 'That control is no longer valid.';
const EXPIRED = 'This menu expired.';
const TOO_LONG = `That message is too long. Keep it to ${TEXT_MAX} characters.`;
const { GUESS_INTERVAL_MIN, GUESS_INTERVAL_MAX } = require('../../../guess/constants');
const MINUTES_ERROR = `Enter a whole number of minutes from ${GUESS_INTERVAL_MIN} to ${GUESS_INTERVAL_MAX} (24 hours).`;
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
        { id: 'anime', label: 'Anime lookups on/off', kind: 'toggle', key: 'AnimeCommandStatus' },
        { id: 'meme', label: 'Meme on/off', kind: 'toggle', key: 'MemeCommandStatus' },
        { id: 'guessgame', label: 'Guess That Anime on/off', kind: 'toggle', key: 'GuessCommandStatus' },
        { id: 'information', label: 'Information on/off', kind: 'toggle', key: 'InfoCommandStatus' },
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
    guess: [
        { id: 'status', label: 'Auto-drop on/off', kind: 'toggle', key: 'GuessStatus' },
        { id: 'channel', label: 'Drop channel', kind: 'channel', key: 'GuessChannel' },
        {
            id: 'interval',
            label: 'Drop interval',
            kind: 'minutes',
            key: 'GuessInterval',
            valueKey: 'Minutes',
            max: 4,
            minNumber: GUESS_INTERVAL_MIN,
            maxNumber: GUESS_INTERVAL_MAX,
            preset: '10',
            placeholder: '10 to 1440 minutes (up to 24 hours)',
        },
    ],
};

const SECTION_BY_SUB = {
    welcome: 'welcome',
    command: 'commands',
    logging: 'logging',
    autorole: 'autorole',
    muterole: 'muterole',
    leveling: 'leveling',
    guess: 'guess',
};

const openUntil = new Map();

function controlId(action, sectionId, fieldId, userId) {
    return `cfg:${action}:${sectionId}:${fieldId}:${userId}`;
}

function actionFits(field, action) {
    if (action === 'on' || action === 'off') return field.kind === 'toggle';
    if (action === 'channel') return field.kind === 'channel' || field.kind === 'channel-add' || field.kind === 'channel-remove';
    if (action === 'role') return field.kind === 'role';
    if (action === 'modal') return field.kind === 'text' || field.kind === 'minutes';
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
    while (openUntil.size > 1000) openUntil.delete(openUntil.keys().next().value);
}

function viewOptions(interaction) {
    const messageId = interaction && interaction.message && interaction.message.id;
    if (!messageId || !openUntil.has(messageId)) return {};
    const until = openUntil.get(messageId);
    if (typeof until === 'number' && Date.now() < until) return {};
    return { disabled: true, expired: true };
}

function currentText(data, field) {
    const valueKey = field.valueKey || 'Message';
    const values = listValues(data && data[field.key], valueKey);
    const text = values.length ? String(values[0]) : '';
    if (field.kind !== 'minutes') return text;
    if (/^\d{1,4}$/.test(text)) {
        const minutes = Number(text);
        if (minutes >= field.minNumber && minutes <= field.maxNumber) return String(minutes);
    }
    return String(field.preset || field.minNumber || '');
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

const NO_RESTRICTED = 'No channels are restricted.';

// Removal lists what is stored, not a channel picker: a deleted channel can no
// longer be picked, but it can still be taken off the list.
function restrictedChannelMenu(data, sectionId, field, userId, guild) {
    const ids = [...new Set(listValues(data && data[field.key], 'Channels'))].slice(0, 25);
    if (!ids.length) return null;
    const cache = guild && guild.channels && guild.channels.cache;
    return new StringSelectMenuBuilder()
        .setCustomId(controlId('channel', sectionId, field.id, userId))
        .setPlaceholder('Choose a channel to unrestrict')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(ids.map((id) => {
            const channel = cache && typeof cache.get === 'function' ? cache.get(id) : null;
            const name = channel && channel.name ? `#${channel.name}` : 'Deleted channel';
            return { label: name.slice(0, 100), value: id, description: id };
        }));
}

function promptView(data, sectionId, field, userId, guild = null) {
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
    } else if (field.kind === 'channel-remove') {
        menu = restrictedChannelMenu(data, sectionId, field, userId, guild);
        if (!menu) {
            payload.content = NO_RESTRICTED;
            payload.components = [new ActionRowBuilder().addComponents(backButton(sectionId, userId))];
            return payload;
        }
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
        .setStyle(field.kind === 'minutes' ? TextInputStyle.Short : TextInputStyle.Paragraph)
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

async function safeReply(interaction, contentOrPayload) {
    const payload = typeof contentOrPayload === 'string' ? { content: contentOrPayload } : { ...contentOrPayload };
    payload.flags = MessageFlags.Ephemeral;
    payload.allowedMentions = allowedMentions();
    try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await finishReply(interaction, payload);
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

async function safeUpdate(interaction, payload) {
    try {
        await updateComponent(interaction, { ...payload, allowedMentions: allowedMentions() });
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
    if (field.kind === 'minutes') {
        const text = raw.trim();
        if (!/^\d{1,4}$/.test(text)) return { error: MINUTES_ERROR };
        const minutes = Number(text);
        if (!Number.isInteger(minutes) || minutes < field.minNumber || minutes > field.maxNumber) {
            return { error: MINUTES_ERROR };
        }
        setKeyed(data, field.key, field.valueKey || 'Minutes', String(minutes));
        return { ok: true };
    }
    if (field.reset && isDefaultRequest(raw)) {
        setKeyed(data, field.key, 'Message', '');
        return { ok: true };
    }
    if (raw.length > field.max) return { error: TOO_LONG };
    setKeyed(data, field.key, 'Message', raw);
    return { ok: true };
}

const SAVE_ATTEMPTS = 3;

// Reads the latest settings, applies one change, and saves. If another admin
// saved in between (VersionError), it reads again and reapplies the change.
async function saveConfig(guildId, section, change) {
    let result;
    for (let attempt = 1; ; attempt += 1) {
        const data = await loadConfig(guildId);
        result = change(data) || { ok: true };
        if (result.error || result.unchanged) return result;
        try {
            await data.save();
            break;
        } catch (error) {
            if (error?.name !== 'VersionError' || attempt >= SAVE_ATTEMPTS) throw error;
        }
    }
    if (result.syncGuess) await syncGuessSchedule(guildId);
    return result;
}

async function syncGuessSchedule(guildId) {
    try {
        const scheduler = require('../../../guess/scheduler');
        await scheduler.syncGuild(String(guildId));
    } catch (error) {
        console.error('Guess schedule update failed.', redact(error));
    }
}

// Auto-drops depend on the guess section and on the whole-game toggle.
function touchesGuess(section, field) {
    return section === 'guess' || (field && field.key === 'GuessCommandStatus');
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
    if (field.kind === 'text' || field.kind === 'minutes') {
        const modal = buildTextModal(parsed.section, field, currentText(require('../../../utils/getGuildConfig').peekGuildConfig(guildId), field), parsed.userId);
        try {
            await interaction.showModal(modal);
        } catch (error) {
            if (!isQuietError(error)) throw error;
        }
        return;
    }
    await deferComponent(interaction);
    const data = await loadConfig(guildId);
    await safeUpdate(interaction, promptView(data, parsed.section, field, parsed.userId, interaction.guild));
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
    await deferComponent(interaction);
    if (parsed.action === 'back') {
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'on' || parsed.action === 'off') {
        await saveConfig(access.guildId, parsed.section, (data) => {
            setStatus(data, parsed.field.key, parsed.action === 'on' ? 'true' : 'false');
            return { ok: true, syncGuess: touchesGuess(parsed.section, parsed.field) };
        });
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'channel') {
        const picked = pickedChannel(interaction);
        if (!picked.id) {
            await safeReply(interaction, picked.error);
            return;
        }
        await saveConfig(access.guildId, parsed.section, (data) => {
            const kind = parsed.field.kind;
            if (kind === 'channel-add') {
                // Adding a channel that is already restricted changes nothing.
                if (listValues(data[parsed.field.key], 'Channels').includes(picked.id)) return { unchanged: true };
                pushKeyed(data, parsed.field.key, 'Channels', picked.id);
            } else if (kind === 'channel-remove') {
                pullKeyed(data, parsed.field.key, 'Channels', picked.id);
            } else {
                setKeyed(data, parsed.field.key, 'Channel', picked.id);
            }
            return { ok: true, syncGuess: touchesGuess(parsed.section, parsed.field) };
        });
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    if (parsed.action === 'role') {
        const role = pickedRole(interaction);
        if (!role) {
            await safeReply(interaction, 'Pick a role.');
            return;
        }
        const roleError = roleAssignmentError(interaction.guild, role, interaction.member, { requireManageRoles: true });
        if (roleError) {
            await safeReply(interaction, roleError);
            return;
        }
        await saveConfig(access.guildId, parsed.section, (data) => {
            setKeyed(data, parsed.field.key, 'Role', role.id);
        });
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
    await deferComponent(interaction);
    if (!interaction.deferred) await defer(interaction, { ephemeral: true });
    const result = await saveConfig(access.guildId, parsed.section, (data) => {
        const applied = applyText(data, parsed.field, raw);
        return applied.error ? applied : { ok: true, syncGuess: touchesGuess(parsed.section, parsed.field) };
    });
    if (result.error) {
        await safeReply(interaction, result.error);
        return;
    }
    if (typeof interaction.update === 'function') {
        await showOverview(interaction, access.guildId, parsed.section, parsed.userId);
        return;
    }
    await safeReply(interaction, '✅ Saved.');
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

async function openPanel(interaction, subName, deps = {}) {
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
    await defer(interaction, { ephemeral: true });
    const readConfig = deps.loadConfig || loadConfig;
    const data = await readConfig(guildId);
    const message = await replyWithMessage(interaction, {
        ...overviewView(data, sectionId, userId),
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
    });
    if (message && message.id) markOpen(message.id);
    if (!message || typeof message.createMessageComponentCollector !== 'function') return message;

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
    return message;
}

module.exports = {
    PANEL_TIMEOUT_MS,
    TEXT_MAX,
    ONLY_OWNER,
    NEED_MANAGE,
    SERVER_ONLY,
    STALE,
    EXPIRED,
    TOO_LONG,
    MINUTES_ERROR,
    NO_RESTRICTED,
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
