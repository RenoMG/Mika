const { PLACEHOLDER_ICON } = require('../../../brand');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Colors,
    EmbedBuilder,
    PermissionsBitField,
    StringSelectMenuBuilder,
} = require('discord.js');

const SELECT_CUSTOM_ID = 'help:section';
const HOME_CUSTOM_ID = 'help:home';
const CATEGORY_BUTTON_PREFIX = 'help:cat:';
const HELP_TIMEOUT_MS = 120000;
const FOOTER = 'Mika | ❓ help';

const SERVER_INVITE = 'https://discord.gg/7uyR6g2N4K';
const BOT_INVITE = 'https://discord.com/api/oauth2/authorize?client_id=795165717283471370&permissions=8&scope=bot%20applications.commands';

const CATEGORY_ORDER = [
    { id: 'moderation', label: 'Moderation', blurb: 'Ban, kick, mute, warn, clear, and infractions.' },
    { id: 'social', label: 'Social', blurb: 'Reactions, jokes, facts, and ratings.' },
    { id: 'image', label: 'Image', blurb: 'Random animal pictures.' },
    { id: 'information', label: 'Info', blurb: 'Server, user, and bot information.' },
    { id: 'leveling', label: 'Leveling', blurb: 'Rank and the server leaderboard.' },
    { id: 'meme', label: 'Meme', blurb: 'A random meme.' },
    { id: 'configuration', label: 'Config', blurb: 'Welcome, logging, roles, and which commands are enabled.' },
    { id: 'help', label: 'Help', blurb: 'This menu.' },
];

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
    return field.toArray().map((name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
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
            if (option.name === 'question') return 'will it rain';
            if (option.name === 'id') return '123456789012345678';
            if (option.name === 'gmessage' || option.name === 'fmessage' || option.name === 'message') return 'hello';
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
    const json = command.data.toJSON();
    const perms = permissionNames(command.permissions || json.default_member_permissions);
    const subs = subcommandsOf(json);
    const blocks = [];

    if (subs.length === 0) {
        const example = command.example || exampleFromOptions(json.name, null, json.options);
        let text = `**/${json.name}** — ${json.description}\n\`${example}\``;
        if (perms.length) text += `\nRequires ${perms.join(', ')}.`;
        blocks.push(text);
        return blocks;
    }

    let header = `**/${json.name}** — ${json.description}`;
    if (command.example) header += `\n\`${command.example}\``;
    if (perms.length) header += `\nRequires ${perms.join(', ')}.`;
    blocks.push(header);

    for (const sub of subs) {
        const override = command.examples && command.examples[sub.name];
        const example = override || exampleFromOptions(json.name, sub.name, sub.options);
        let text = `**${sub.name}** — ${sub.description}\n\`${example}\``;
        const extra = permissionNames(command.subcommandPermissions && command.subcommandPermissions[sub.name]);
        if (extra.length && extra.join(', ') !== perms.join(', ')) {
            text += `\nRequires ${extra.join(', ')}.`;
        }
        blocks.push(text);
    }
    return blocks;
}

function footer() {
    return { text: FOOTER, iconURL: process.env.MIKAICON || PLACEHOLDER_ICON };
}

function embedsFromBlocks(title, blocks) {
    const embeds = [];
    let description = '';
    const flush = () => {
        if (!description) return;
        embeds.push(new EmbedBuilder()
            .setColor(Colors.Blue)
            .setTitle(embeds.length === 0 ? title : `${title} (continued)`)
            .setDescription(description.trim())
            .setFooter(footer())
            .setTimestamp());
        description = '';
    };

    for (const block of blocks) {
        const next = description ? `${description}\n\n${block}` : block;
        if (next.length > 4000) {
            flush();
            description = block.slice(0, 4000);
        } else {
            description = next;
        }
    }
    flush();
    return embeds.slice(0, 10);
}

function groupCommands(commands) {
    const byId = new Map(CATEGORY_ORDER.map((category) => [category.id, { ...category, commands: [] }]));
    const list = commands?.values ? [...commands.values()] : [...(commands || [])];
    for (const command of list) {
        if (!command?.category || !command.data) continue;
        if (!byId.has(command.category)) {
            byId.set(command.category, {
                id: command.category,
                label: command.category,
                blurb: 'Commands.',
                commands: [],
            });
        }
        byId.get(command.category).commands.push(command);
    }
    for (const category of byId.values()) {
        category.commands.sort((a, b) => a.data.name.localeCompare(b.data.name));
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
        'Pick a section to see each command, what it does, an example, and any permission it needs.',
        '',
        `• Mika server invite link: [Invite](${SERVER_INVITE})`,
        `• Mika invite link: [Invite](${BOT_INVITE})`,
        '',
        ...categories.map((category) => `**${category.label}** — ${category.blurb}`),
    ];
    return new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('Mika help menu')
        .setDescription(lines.join('\n'))
        .setFooter(footer())
        .setTimestamp();
}

function buildHelpView(categories, selected, options = {}) {
    const category = selected ? categories.find((entry) => entry.id === selected) : null;
    const embeds = category
        ? embedsFromBlocks(
            `Mika help menu — ${category.label}`,
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
    componentMode,
    exampleFromOptions,
    blocksForCommand,
    groupCommands,
    buildHelpView,
    selectionFrom,
};
