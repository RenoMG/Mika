const { embed: styledEmbed, footer: styleFooter, footerText } = require('../../../utils/style');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    StringSelectMenuBuilder,
} = require('discord.js');

const { isOff } = require('../../../utils/configStatus');

const SELECT_CUSTOM_ID = 'help:section';
const OFF_NOTE = '-# 🔴 Turned off in this server';
const HOME_CUSTOM_ID = 'help:home';
const CATEGORY_BUTTON_PREFIX = 'help:cat:';
const HELP_TIMEOUT_MS = 120000;
const FOOTER = footerText('help');

// Blurbs stay within the 100 characters a select option shows. `order` lists
// related commands together (warn, then unwarn); anything unlisted follows A-Z.
const CATEGORY_ORDER = [
    {
        id: 'anime', label: 'Anime', emoji: '🎌',
        blurb: 'Search anime, characters, and studios, show your AniList or MAL profile, and memes.',
        order: ['search', 'randomanime', 'profile', 'findprofile', 'link', 'meme'],
    },
    {
        id: 'guess', label: 'Guess That Anime', emoji: '🎯',
        blurb: 'Name the anime or character, earn crystals, duel friends, and climb the season board.',
    },
    {
        id: 'leveling', label: 'Leveling', emoji: '🏆',
        blurb: 'Your rank card and the server XP leaderboard.',
        order: ['level', 'leaderboard'],
    },
    {
        id: 'information', label: 'Info & utility', emoji: '📋',
        blurb: 'Member and server info, plus all about Mika and Reno\'s links.',
        order: ['about', 'whois', 'pfp', 'serverstats', 'status', 'ping'],
    },
    {
        id: 'moderation', label: 'Moderation', emoji: '🔨',
        blurb: 'Warn, mute, kick, and ban members, clear messages, and review records.',
        order: ['warn', 'unwarn', 'clearwarns', 'mute', 'unmute', 'kick', 'ban', 'unban', 'clear', 'infractions', 'removeinfraction', 'clearinfractions'],
    },
    {
        id: 'configuration', label: 'Configuration', emoji: '⚙️',
        blurb: 'One menu for every server setting. Needs Manage Server.',
    },
];

// Discord's settings use these names, not the API flag names.
const PERMISSION_LABELS = {
    ManageGuild: 'Manage Server',
    ModerateMembers: 'Timeout Members',
    ManageEmojisAndStickers: 'Manage Expressions',
    ManageGuildExpressions: 'Manage Expressions',
    ViewAuditLog: 'View Audit Log',
};

function componentMode(categoryCount) {
    // A button row holds 5 components. Home shares that row, so 5 or more
    // sections (or anything that would overflow the row) use a select menu.
    if (categoryCount > 5 || categoryCount + 1 > 5) return 'select';
    return 'buttons';
}

function permissionNames(bits) {
    if (bits == null || bits === '0' || (Array.isArray(bits) && bits.length === 0)) return [];
    const field = Array.isArray(bits) || typeof bits === 'bigint'
        ? new PermissionsBitField(bits)
        : new PermissionsBitField(BigInt(bits));
    return field.toArray().map((name) => PERMISSION_LABELS[name] || name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
}

function sampleForOption(option) {
    if (option.choices && option.choices.length) return option.choices[0].name;
    switch (option.type) {
        case 6: return '@user';
        case 7: return '#channel';
        case 8: return '@role';
        case 4:
        case 10: return option.name === 'amount' ? '5' : '1';
        case 5: return 'true';
        default:
            if (option.name === 'reason') return 'spamming';
            if (option.name === 'id') return '123456789012345678';
            return 'text';
    }
}

function exampleFromOptions(commandName, subName, options) {
    const pieces = [`/${commandName}`];
    if (subName) pieces.push(subName);
    const opts = (options || []).filter((option) => option.type !== 1 && option.type !== 2);
    const required = opts.filter((option) => option.required);
    const optional = opts.filter((option) => !option.required);
    const shown = required.length >= 3 ? required : required.concat(optional.slice(0, 3 - required.length));
    for (const option of shown) {
        pieces.push(`${option.name}:${sampleForOption(option)}`);
    }
    return pieces.join(' ');
}

function subcommandsOf(json) {
    const subs = [];
    for (const option of json.options || []) {
        if (option.type === 1) {
            subs.push({ name: option.name, description: option.description, options: option.options || [] });
        } else if (option.type === 2) {
            for (const sub of option.options || []) {
                if (sub.type === 1) {
                    subs.push({
                        name: `${option.name} ${sub.name}`,
                        description: sub.description,
                        options: sub.options || [],
                    });
                }
            }
        }
    }
    return subs;
}

function blocksForCommand(command) {
    const blocks = commandBlocks(command);
    return command.off ? blocks.map((block) => `${block}\n${OFF_NOTE}`) : blocks;
}

function commandBlocks(command) {
    const json = command.data.toJSON();
    const perms = permissionNames(command.permissions || json.default_member_permissions);
    const subs = subcommandsOf(json);

    if (subs.length === 0) {
        const example = command.example || exampleFromOptions(json.name, null, json.options);
        let text = `**/${json.name}** — ${json.description}\n\`${example}\``;
        if (command.note) text += `\n${command.note}`;
        if (perms.length) text += `\nRequires ${perms.join(', ')}.`;
        return [text];
    }

    // Subcommands are the only rows. A parent line such as "/levels — Leveling based commands"
    // would list the same command twice.
    return subs.map((sub) => {
        const leaf = sub.name.split(' ').pop();
        const override = command.examples && (command.examples[sub.name] || command.examples[leaf]);
        const example = override || exampleFromOptions(json.name, sub.name, sub.options);
        let text = `**/${json.name} ${sub.name}** — ${sub.description}\n\`${example}\``;
        const extra = permissionNames(command.subcommandPermissions && command.subcommandPermissions[leaf]);
        const shown = extra.length ? extra : perms;
        const note = command.notes && (command.notes[sub.name] || command.notes[leaf]);
        if (note) text += `\n${note}`;
        if (shown.length) text += `\nRequires ${shown.join(', ')}.`;
        return text;
    });
}

function footer() {
    return styleFooter('help');
}

const DESCRIPTION_LIMIT = 4096;
const EMBED_LIMIT = 6000;

function embedTitle(base, index) {
    const title = index === 0 ? base : `${base} (continued)`;
    return title.length > 256 ? title.slice(0, 256) : title;
}

function fits(title, description) {
    return description.length <= DESCRIPTION_LIMIT && title.length + description.length + FOOTER.length <= EMBED_LIMIT;
}

function embedsFromBlocks(title, blocks) {
    const embeds = [];
    let description = '';
    const flush = () => {
        if (!description) return;
        const pageTitle = embedTitle(title, embeds.length);
        embeds.push(styledEmbed({ title: pageTitle, description: description.trim() }).setFooter(footer()));
        description = '';
    };

    for (const block of blocks) {
        const piece = block.length > DESCRIPTION_LIMIT ? block.slice(0, DESCRIPTION_LIMIT) : block;
        const pageTitle = embedTitle(title, embeds.length);
        const next = description ? `${description}\n\n${piece}` : piece;
        if (description && !fits(pageTitle, next)) flush();
        const freshTitle = embedTitle(title, embeds.length);
        const fresh = description ? `${description}\n\n${piece}` : piece;
        description = fits(freshTitle, fresh) ? fresh : piece.slice(0, DESCRIPTION_LIMIT);
    }
    flush();
    // Discord allows 10 embeds on one message. Real sections fit; this only trims a runaway page.
    return embeds.slice(0, 10);
}

// config is the server's settings. Commands whose feature is turned off stay
// listed, marked off, so members know why they don't respond.
function groupCommands(commands, config = null) {
    const byId = new Map(CATEGORY_ORDER.map((category) => [category.id, { ...category, commands: [] }]));
    const list = commands?.values ? [...commands.values()] : [...(commands || [])];
    for (const command of list) {
        if (!command?.category || !command.data) continue;
        // /help is mentioned on the home overview instead of getting its own section.
        if (command.category === 'help') continue;
        if (!byId.has(command.category)) {
            byId.set(command.category, {
                id: command.category,
                label: command.category,
                blurb: 'Commands.',
                commands: [],
            });
        }
        const off = Boolean(config && command.configKey && isOff(config, command.configKey));
        byId.get(command.category).commands.push(off ? { ...command, off } : command);
    }
    for (const category of byId.values()) {
        const rank = (command) => {
            const index = (category.order || []).indexOf(command.data.name);
            return index === -1 ? Infinity : index;
        };
        category.commands.sort((a, b) => rank(a) - rank(b) || a.data.name.localeCompare(b.data.name));
        if (category.commands.length && category.commands.every((command) => command.off)) {
            category.blurb = `🔴 Off here · ${category.blurb}`;
        }
    }
    return [...byId.values()].filter((category) => category.commands.length > 0);
}

function homeButton(disabled) {
    return new ButtonBuilder()
        .setCustomId(HOME_CUSTOM_ID)
        .setLabel('Home')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
}

function buildComponents(categories, selected, { disabled = false } = {}) {
    const rows = [];
    if (componentMode(categories.length) === 'select') {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(SELECT_CUSTOM_ID)
            .setPlaceholder('Choose a section')
            .setDisabled(disabled)
            .addOptions(categories.map((category) => ({
                label: category.label.slice(0, 25),
                emoji: category.emoji,
                value: category.id,
                description: (category.blurb || 'Commands').slice(0, 100),
                default: category.id === selected,
            })));
        rows.push(new ActionRowBuilder().addComponents(menu));
        rows.push(new ActionRowBuilder().addComponents(homeButton(disabled)));
    } else {
        const buttons = categories.map((category) => new ButtonBuilder()
            .setCustomId(`${CATEGORY_BUTTON_PREFIX}${category.id}`)
            .setLabel(category.label.slice(0, 80))
            .setStyle(category.id === selected ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled));
        buttons.push(homeButton(disabled));
        rows.push(new ActionRowBuilder().addComponents(...buttons));
    }
    return rows;
}

function overviewEmbed(categories) {
    const lines = [
        'Pick a section below to see each command, what it does, an example, and any permission it needs.',
        '',
        ...categories.map((category) => `${category.emoji || '•'} **${category.label}** — ${category.blurb}`),
        '',
        '🌸 Mika is made just for **Reno\'s World**. Run `/about` for the story and Reno\'s links.',
        '-# Server admins can turn features off with `/config`. Those commands show as turned off here. Reopen this menu with `/help`.',
    ];
    return styledEmbed({ title: '❓ Mika help', description: lines.join('\n') }).setFooter(footer());
}

function buildHelpView(categories, selected, options = {}) {
    const category = selected ? categories.find((entry) => entry.id === selected) : null;
    const embeds = category
        ? embedsFromBlocks(
            `${category.emoji ? `${category.emoji} ` : ''}${category.label} commands`,
            category.commands.flatMap((command) => blocksForCommand(command)),
        )
        : [overviewEmbed(categories)];
    if (category && embeds.length === 0) {
        embeds.push(overviewEmbed(categories));
    }
    return {
        embeds,
        components: buildComponents(categories, category ? category.id : null, options),
    };
}

function selectionFrom(interaction) {
    if (interaction.customId === HOME_CUSTOM_ID) return { id: null };
    if (interaction.customId === SELECT_CUSTOM_ID) return { id: interaction.values?.[0] ?? null };
    if (typeof interaction.customId === 'string' && interaction.customId.startsWith(CATEGORY_BUTTON_PREFIX)) {
        return { id: interaction.customId.slice(CATEGORY_BUTTON_PREFIX.length) };
    }
    return null;
}

module.exports = {
    SELECT_CUSTOM_ID,
    HOME_CUSTOM_ID,
    CATEGORY_BUTTON_PREFIX,
    HELP_TIMEOUT_MS,
    CATEGORY_ORDER,
    OFF_NOTE,
    componentMode,
    exampleFromOptions,
    blocksForCommand,
    groupCommands,
    buildHelpView,
    selectionFrom,
};
