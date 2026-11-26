// /config: one private menu for every server setting. The home screen sums up
// each section; picking one shows its settings with controls that change them
// in place. Custom ids only name the action, section, control, and opener, so
// the new value always comes from the control itself, and every click rechecks
// Manage Server. Panels hold no state, so they keep working across restarts.
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
const { defer, deferComponent, finish, updateComponent } = require('../../../utils/ack');
const { allowedMentions } = require('../../../utils/mentions');
const { redact } = require('../../../utils/redact');
const { isQuietError } = require('../../../utils/interactionErrors');
const { roleAssignmentError } = require('../../../utils/roles');
const { GENERIC_ERROR } = require('../../../utils/messages');
const { GUESS_INTERVAL_MAX, GUESS_INTERVAL_MIN } = require('../../../guess/constants');
const { intervalMinutes } = require('../../../guess/settings');
const { listValues, loadConfig, setKeyed, setStatus } = require('./fields');
const { getGuildConfig } = require('../../../utils/getGuildConfig');
const { BLOG_KEYS } = require('../../../blog/settings');
const { NEWS_KEYS, newsSources } = require('../../../news/settings');
const { SOURCES, SOURCE_IDS } = require('../../../news/sources');
const { isDefaultRequest } = require('../../../utils/formatMessage');
const {
    SECTIONS,
    TEXT_MAX,
    controlOf,
    homeEmbed,
    intervalChoices,
    intervalText,
    isDefaultText,
    sectionEmbed,
    sectionOf,
    textValue,
    toggleOn,
} = require('./sections');

const ONLY_OWNER = 'Only the person who opened this menu can use it. Run /config to open your own.';
const NEED_MANAGE = 'You need Manage Server to change these settings.';
const SERVER_ONLY = 'This menu only works in a server.';
const STALE = 'That control is no longer valid. Run /config again.';
const TOO_LONG = `That message is too long. Keep it to ${TEXT_MAX} characters.`;
const EMPTY_TEXT = 'The message cannot be blank. Use Reset to go back to the default.';
const PICK_TEXT_CHANNEL = 'Pick a text or announcement channel.';
const PICK_PING_ROLE = 'Pick a role to ping. @everyone can\'t be used.';
const RESTRICTED_LIMIT = 25;

const POST_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const RESTRICT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice];
const GUESS_KEYS = new Set(['GuessStatus', 'GuessChannel', 'GuessInterval', 'GuessCommandStatus']);
const SAVE_ATTEMPTS = 3;

// action -> the control kinds it may act on. nav and home name no control.
const ACTIONS = {
    nav: null,
    home: null,
    on: ['toggle'],
    off: ['toggle'],
    channel: ['channel'],
    channels: ['channels'],
    role: ['role'],
    interval: ['interval'],
    edit: ['text'],
    reset: ['text'],
    modal: ['text'],
    preview: ['preview'],
    sources: ['sources'],
};

function controlId(action, sectionId, id, userId) {
    return `cfg:${action}:${sectionId}:${id}:${userId}`;
}

function parseId(customId) {
    if (typeof customId !== 'string') return null;
    const parts = customId.split(':');
    if (parts.length !== 5 || parts[0] !== 'cfg') return null;
    const [, action, sectionId, id, userId] = parts;
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action) || !/^\d{17,20}$/.test(userId)) return null;
    if (ACTIONS[action] === null) {
        return sectionId === '-' && id === '-' ? { action, section: null, control: null, userId } : null;
    }
    const section = sectionOf(sectionId);
    const control = section && controlOf(sectionId, id);
    if (!control || !ACTIONS[action].includes(control.kind)) return null;
    return { action, section, control, userId };
}

function isConfigComponentId(customId) {
    return typeof customId === 'string' && customId.startsWith('cfg:') && !customId.startsWith('cfg:modal:');
}

function isConfigModalId(customId) {
    return typeof customId === 'string' && customId.startsWith('cfg:modal:');
}

// ---------------------------------------------------------------- views

function rowsOf(components, size = 5) {
    const rows = [];
    for (let index = 0; index < components.length; index += size) {
        rows.push(new ActionRowBuilder().addComponents(components.slice(index, index + size)));
    }
    return rows;
}

function navMenu(userId, selected = null) {
    return new StringSelectMenuBuilder()
        .setCustomId(controlId('nav', '-', '-', userId))
        .setPlaceholder('Choose a section to edit')
        .addOptions(SECTIONS.map((section) => ({
            label: section.label,
            emoji: section.emoji,
            value: section.id,
            description: section.blurb.slice(0, 100),
            default: section.id === selected,
        })));
}

function homeView(data, userId) {
    return {
        embeds: [homeEmbed(data || {})],
        components: [new ActionRowBuilder().addComponents(navMenu(userId))],
        allowedMentions: allowedMentions(),
    };
}

function toggleButton(data, section, control, userId) {
    const on = toggleOn(data, control);
    // The button shows the current state; pressing it switches to the other one.
    return new ButtonBuilder()
        .setCustomId(controlId(on ? 'off' : 'on', section.id, control.id, userId))
        .setLabel(`${control.label}: ${on ? 'On' : 'Off'}`)
        .setStyle(on ? ButtonStyle.Success : ButtonStyle.Secondary);
}

function channelMenu(data, section, control, userId) {
    const menu = new ChannelSelectMenuBuilder()
        .setCustomId(controlId('channel', section.id, control.id, userId))
        .setPlaceholder(`${control.label}: pick a channel, or clear it`)
        .setChannelTypes(...POST_TYPES)
        .setMinValues(0)
        .setMaxValues(1);
    const current = listValues(data[control.key], 'Channel')[0];
    if (current) menu.setDefaultChannels(current);
    return menu;
}

function knownChannels(guild, ids) {
    const cache = guild && guild.channels && guild.channels.cache;
    if (!cache || typeof cache.has !== 'function') return ids;
    return ids.filter((id) => cache.has(id));
}

function channelsMenu(data, section, control, userId, guild) {
    const ids = [...new Set(listValues(data[control.key], 'Channels'))];
    const menu = new ChannelSelectMenuBuilder()
        .setCustomId(controlId('channels', section.id, control.id, userId))
        .setPlaceholder('Pick every channel to restrict')
        .setChannelTypes(...RESTRICT_TYPES)
        .setMinValues(0)
        .setMaxValues(RESTRICTED_LIMIT);
    // Only channels that still exist can be shown as picked.
    const shown = knownChannels(guild, ids).slice(0, RESTRICTED_LIMIT);
    if (shown.length) menu.setDefaultChannels(...shown);
    return menu;
}

function roleMenu(data, section, control, userId) {
    const menu = new RoleSelectMenuBuilder()
        .setCustomId(controlId('role', section.id, control.id, userId))
        .setPlaceholder(`${control.label}: pick a role, or clear it`)
        .setMinValues(0)
        .setMaxValues(1);
    const current = listValues(data[control.key], 'Role')[0];
    if (current) menu.setDefaultRoles(current);
    return menu;
}

function intervalMenu(data, section, control, userId) {
    const current = intervalMinutes(data);
    return new StringSelectMenuBuilder()
        .setCustomId(controlId('interval', section.id, control.id, userId))
        .setPlaceholder('Drop interval')
        .addOptions(intervalChoices(current).map((minutes) => ({
            label: `Every ${intervalText(minutes)}`,
            value: String(minutes),
            default: minutes === current,
        })));
}

// One option per news site; the picked ones are followed.
function sourcesMenu(data, section, control, userId) {
    const followed = new Set(newsSources(data));
    return new StringSelectMenuBuilder()
        .setCustomId(controlId('sources', section.id, control.id, userId))
        .setPlaceholder('News sites: pick every site to follow')
        .setMinValues(0)
        .setMaxValues(SOURCES.length)
        .addOptions(SOURCES.map((source) => ({
            label: source.name,
            emoji: source.emoji,
            value: source.id,
            description: new URL(source.home).hostname.replace(/^www\./, ''),
            default: followed.has(source.id),
        })));
}

function textButtons(data, section, control, userId) {
    return [
        new ButtonBuilder()
            .setCustomId(controlId('edit', section.id, control.id, userId))
            .setLabel(`Edit ${control.short}`)
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(controlId('reset', section.id, control.id, userId))
            .setLabel(`Reset ${control.short}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(isDefaultText(data, control)),
    ];
}

function previewButton(section, control, userId) {
    return new ButtonBuilder()
        .setCustomId(controlId('preview', section.id, control.id, userId))
        .setLabel(control.label)
        .setEmoji('👀')
        .setStyle(ButtonStyle.Primary);
}

function backButton(userId) {
    return new ButtonBuilder()
        .setCustomId(controlId('home', '-', '-', userId))
        .setLabel('All settings')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary);
}

// Toggles first, then one row per menu, then the text buttons and Back.
// Every section fits Discord's five rows.
function sectionComponents(data, section, userId, guild) {
    const toggles = [];
    const menus = [];
    const actions = [];
    for (const control of section.controls) {
        if (control.kind === 'toggle') toggles.push(toggleButton(data, section, control, userId));
        else if (control.kind === 'preview') toggles.push(previewButton(section, control, userId));
        else if (control.kind === 'channel') menus.push(channelMenu(data, section, control, userId));
        else if (control.kind === 'channels') menus.push(channelsMenu(data, section, control, userId, guild));
        else if (control.kind === 'role') menus.push(roleMenu(data, section, control, userId));
        else if (control.kind === 'interval') menus.push(intervalMenu(data, section, control, userId));
        else if (control.kind === 'sources') menus.push(sourcesMenu(data, section, control, userId));
        else if (control.kind === 'text') actions.push(...textButtons(data, section, control, userId));
    }
    actions.push(backButton(userId));
    if (!menus.length) return rowsOf([...toggles, ...actions]);
    return [...rowsOf(toggles), ...menus.map((menu) => new ActionRowBuilder().addComponents(menu)), ...rowsOf(actions)];
}

function sectionView(data, sectionId, userId, guild = null) {
    const section = sectionOf(sectionId);
    if (!section) return homeView(data, userId);
    const embed = sectionEmbed(sectionId, data || {});
    const restricted = section.controls.find((control) => control.kind === 'channels');
    if (restricted) {
        const ids = [...new Set(listValues(data && data[restricted.key], 'Channels'))];
        const gone = ids.length - knownChannels(guild, ids).length;
        if (gone > 0) embed.setFooter({ ...embed.data.footer, text: `${embed.data.footer.text} · ${gone} deleted ${gone === 1 ? 'channel is' : 'channels are'} dropped on the next save` });
    }
    return {
        embeds: [embed],
        components: sectionComponents(data || {}, section, userId, guild),
        allowedMentions: allowedMentions(),
    };
}

function textModal(data, section, control, userId) {
    const max = control.max || TEXT_MAX;
    const input = new TextInputBuilder()
        .setCustomId('text')
        .setLabel(control.label.slice(0, 45))
        .setStyle(control.singleLine ? TextInputStyle.Short : TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(max)
        .setPlaceholder(control.hint.slice(0, 100));
    const current = textValue(data, control).slice(0, max);
    if (current.trim()) input.setValue(current);
    return new ModalBuilder()
        .setCustomId(controlId('modal', section.id, control.id, userId))
        .setTitle(control.label.slice(0, 45))
        .addComponents(new ActionRowBuilder().addComponents(input));
}

// ---------------------------------------------------------------- access

function canManage(interaction) {
    const perms = interaction && interaction.member && interaction.member.permissions;
    if (!perms || typeof perms.has !== 'function') return false;
    try {
        return perms.has(PermissionFlagsBits.ManageGuild) === true;
    } catch (error) {
        return false;
    }
}

function guard(interaction, parsed) {
    if (!parsed) return { error: STALE };
    const userId = interaction && interaction.user && interaction.user.id;
    if (!userId || userId !== parsed.userId) return { error: ONLY_OWNER };
    const guildId = interaction.guild && interaction.guild.id;
    if (!guildId) return { error: SERVER_ONLY };
    if (!canManage(interaction)) return { error: NEED_MANAGE };
    return { guildId };
}

async function privateNote(interaction, content) {
    const payload = { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
    try {
        if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
        else await interaction.reply(payload);
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

async function show(interaction, payload) {
    try {
        await updateComponent(interaction, payload);
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

// ---------------------------------------------------------------- saving

// Reads the latest settings, applies one change, and saves. If another admin
// saved in between (VersionError), it reads again and reapplies the change.
async function saveConfig(guildId, change) {
    let result;
    let data;
    for (let attempt = 1; ; attempt += 1) {
        data = await loadConfig(guildId);
        result = change(data) || {};
        if (result.error) return { ...result, data };
        try {
            await data.save();
            break;
        } catch (error) {
            if (error?.name !== 'VersionError' || attempt >= SAVE_ATTEMPTS) throw error;
        }
    }
    if (result.key && GUESS_KEYS.has(result.key)) await syncGuessSchedule(guildId);
    // Not awaited: the panel redraws while the watcher records the feed in the background.
    if (result.key && BLOG_KEYS.has(result.key)) require('../../../blog/watcher').syncBlogGuild(String(guildId));
    if (result.key && NEWS_KEYS.has(result.key)) require('../../../news/watcher').syncNewsGuild(String(guildId));
    return { ...result, data };
}

async function syncGuessSchedule(guildId) {
    try {
        await require('../../../guess/scheduler').syncGuild(String(guildId));
    } catch (error) {
        console.error('Guess schedule update failed.', redact(error));
    }
}

function setList(doc, key, property, values) {
    doc[key] = values.map((value) => ({ [property]: value }));
    if (typeof doc.markModified === 'function') doc.markModified(key);
}

function snowflakes(values) {
    return (Array.isArray(values) ? values : []).filter((value) => typeof value === 'string' && /^\d{17,20}$/.test(value));
}

// The bot has to be able to post where a setting sends messages.
function postProblem(channel, guild) {
    const me = guild && guild.members && guild.members.me;
    if (!channel || !me || typeof channel.permissionsFor !== 'function') return null;
    let perms;
    try {
        perms = channel.permissionsFor(me);
    } catch (error) {
        return null;
    }
    if (!perms || typeof perms.has !== 'function') return null;
    const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
    if (needed.every((permission) => perms.has(permission))) return null;
    return `I can't post in <#${channel.id}>. Give me View Channel, Send Messages, and Embed Links there, then pick it again.`;
}

function resolvedChannel(interaction, id) {
    const channels = interaction.channels;
    return channels && typeof channels.get === 'function' ? channels.get(id) || null : null;
}

// A blank level-up message means the built-in one; welcome texts store theirs.
function resetChange(control) {
    return { apply: (data) => setKeyed(data, control.key, control.field || 'Message', control.blankIsDefault ? '' : control.fallback) };
}

// Checks text that has to work before it is saved. Feeds are fetched once, and
// the address that was found (a home page's feed link, say) is what gets stored.
const VALIDATORS = {
    feed: async (raw) => {
        const { resolveFeedUrl } = require('../../../blog/feed');
        try {
            const { url } = await resolveFeedUrl(raw);
            return { value: url };
        } catch (error) {
            return { error: `That feed didn't work. ${error && error.message ? error.message : ''}`.trim() };
        }
    },
};

// Each handler checks the picked value and returns the change to save.
const CHANGES = {
    on: ({ control }) => ({ apply: (data) => setStatus(data, control.key, 'true') }),
    off: ({ control }) => ({ apply: (data) => setStatus(data, control.key, 'false') }),
    channel: ({ control, interaction }) => {
        const [id] = snowflakes(interaction.values);
        if (!id) return { apply: (data) => setKeyed(data, control.key, 'Channel', '') };
        const channel = resolvedChannel(interaction, id);
        if (channel && channel.type != null && !POST_TYPES.includes(channel.type)) return { error: PICK_TEXT_CHANNEL };
        const problem = control.posts ? postProblem(channel, interaction.guild) : null;
        if (problem) return { error: problem };
        return { apply: (data) => setKeyed(data, control.key, 'Channel', id) };
    },
    channels: ({ control, interaction }) => {
        const ids = [...new Set(snowflakes(interaction.values))].slice(0, RESTRICTED_LIMIT);
        return { apply: (data) => setList(data, control.key, 'Channels', ids) };
    },
    role: ({ control, interaction }) => {
        const [id] = snowflakes(interaction.values);
        if (!id) return { apply: (data) => setKeyed(data, control.key, 'Role', '') };
        if (control.ping) {
            if (id === interaction.guild.id) return { error: PICK_PING_ROLE };
            return { apply: (data) => setKeyed(data, control.key, 'Role', id) };
        }
        const roles = interaction.roles;
        const role = (roles && typeof roles.get === 'function' && roles.get(id))
            || (interaction.guild.roles && interaction.guild.roles.cache && interaction.guild.roles.cache.get(id))
            || null;
        const problem = roleAssignmentError(interaction.guild, role, interaction.member, { requireManageRoles: true });
        if (problem) return { error: problem };
        return { apply: (data) => setKeyed(data, control.key, 'Role', id) };
    },
    interval: ({ control, interaction }) => {
        const text = Array.isArray(interaction.values) ? String(interaction.values[0] || '') : '';
        const minutes = /^\d{1,4}$/.test(text) ? Number(text) : NaN;
        if (!Number.isInteger(minutes) || minutes < GUESS_INTERVAL_MIN || minutes > GUESS_INTERVAL_MAX) return { error: STALE };
        return { apply: (data) => setKeyed(data, control.key, 'Minutes', String(minutes)) };
    },
    sources: ({ control, interaction }) => {
        const picked = new Set(Array.isArray(interaction.values) ? interaction.values : []);
        // Only known sites, in their listed order. An empty list is allowed: nothing is posted.
        const ids = SOURCE_IDS.filter((id) => picked.has(id));
        return { apply: (data) => setList(data, control.key, 'Source', ids) };
    },
    reset: ({ control }) => resetChange(control),
    modal: async ({ control, interaction }) => {
        let raw;
        try {
            raw = interaction.fields.getTextInputValue('text');
        } catch (error) {
            return { error: EMPTY_TEXT };
        }
        if (typeof raw !== 'string' || !raw.trim()) return { error: EMPTY_TEXT };
        // Typing "default" still works, the same as pressing Reset.
        if (isDefaultRequest(raw)) return resetChange(control);
        const max = control.max || TEXT_MAX;
        if (raw.length > max) return { error: max === TEXT_MAX ? TOO_LONG : `That is too long. Keep it to ${max} characters.` };
        let value = raw;
        if (control.validates) {
            const checked = await VALIDATORS[control.validates](raw.trim());
            if (checked.error) return { error: checked.error };
            value = checked.value;
        }
        return { apply: (data) => setKeyed(data, control.key, control.field || 'Message', value) };
    },
};

// ---------------------------------------------------------------- routing

// Blog Watcher's and Anime News' preview: the newest post exactly as it would
// be sent, shown only to the admin, with the ping role written out but not pinged.
const PREVIEWS = {
    blog: (data) => require('../../../blog/watcher').previewBlogPost(data),
    news: (data) => require('../../../news/watcher').previewNews(data),
};

async function sendPreview(interaction, data, sectionId) {
    const preview = PREVIEWS[sectionId];
    if (!preview) {
        await privateNote(interaction, STALE);
        return;
    }
    const result = await preview(data);
    if (result.error) {
        await privateNote(interaction, result.error);
        return;
    }
    try {
        await interaction.followUp({ ...result.payload, flags: MessageFlags.Ephemeral });
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

async function route(interaction) {
    const parsed = parseId(interaction && interaction.customId);
    const access = guard(interaction, parsed);
    if (access.error) {
        await privateNote(interaction, access.error);
        return;
    }
    const { action, section, control, userId } = parsed;

    // A modal must be the first answer, so Edit opens it before anything is deferred.
    if (action === 'edit') {
        // The cached snapshot is enough to prefill the text box, and is fast.
        const data = await getGuildConfig(access.guildId, { readOnly: true });
        try {
            await interaction.showModal(textModal(data, section, control, userId));
        } catch (error) {
            if (!isQuietError(error)) throw error;
        }
        return;
    }

    await deferComponent(interaction);
    if (action === 'home') {
        await show(interaction, homeView(await loadConfig(access.guildId), userId));
        return;
    }
    if (action === 'nav') {
        const choice = Array.isArray(interaction.values) ? interaction.values[0] : null;
        if (!sectionOf(choice)) {
            await privateNote(interaction, STALE);
            return;
        }
        await show(interaction, sectionView(await loadConfig(access.guildId), choice, userId, interaction.guild));
        return;
    }

    if (action === 'preview') {
        await sendPreview(interaction, await loadConfig(access.guildId), section.id);
        return;
    }

    const change = await CHANGES[action]({ control, interaction });
    if (change.error) {
        await privateNote(interaction, change.error);
        // Redraw, so a menu shows the stored value instead of the rejected pick.
        await show(interaction, sectionView(await loadConfig(access.guildId), section.id, userId, interaction.guild));
        return;
    }
    const saved = await saveConfig(access.guildId, (data) => {
        change.apply(data);
        return { key: control.key };
    });
    await show(interaction, sectionView(saved.data, section.id, userId, interaction.guild));
}

async function handle(interaction) {
    try {
        await route(interaction);
    } catch (error) {
        if (isQuietError(error)) return;
        console.error(redact(error));
        try {
            await privateNote(interaction, GENERIC_ERROR);
        } catch (replyError) {
            if (!isQuietError(replyError)) console.error(redact(replyError));
        }
    }
}

// The /config command: the home screen, or straight to one section.
async function openHub(interaction, sectionId = null, deps = {}) {
    const userId = interaction && interaction.user && interaction.user.id;
    const guildId = interaction && interaction.guild && interaction.guild.id;
    if (!userId || !guildId) return finish(interaction, { content: SERVER_ONLY, flags: MessageFlags.Ephemeral });
    if (!canManage(interaction)) return finish(interaction, { content: NEED_MANAGE, flags: MessageFlags.Ephemeral });
    await defer(interaction, { ephemeral: true });
    const data = await (deps.loadConfig || loadConfig)(guildId);
    const view = sectionOf(sectionId)
        ? sectionView(data, sectionId, userId, interaction.guild)
        : homeView(data, userId);
    return finish(interaction, { ...view, flags: MessageFlags.Ephemeral });
}

module.exports = {
    ONLY_OWNER,
    NEED_MANAGE,
    SERVER_ONLY,
    STALE,
    TOO_LONG,
    EMPTY_TEXT,
    PICK_TEXT_CHANNEL,
    PICK_PING_ROLE,
    RESTRICTED_LIMIT,
    VALIDATORS,
    parseId,
    isConfigComponentId,
    isConfigModalId,
    homeView,
    sectionView,
    textModal,
    openHub,
    handleConfigComponent: handle,
    handleConfigModal: handle,
};
