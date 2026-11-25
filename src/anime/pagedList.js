const { updateComponent } = require('../utils/ack');
const { allowedMentions } = require('../utils/mentions');
const { embed: styledEmbed } = require('../utils/style');
const { snowflake } = require('./ids');
const { defer, finish } = require('../utils/ack');
const { ephemeral, replyMenu, watchMenu } = require('./menu');
const { noteIdentity, profileForViewer } = require('./profiles');
const { neutralize } = require('./text');
const { pageButtons } = require('../utils/pager');

const LIST_PAGE_SIZE = 10;
const WATCHING_PREV = 'watching:list:prev';
const WATCHING_NEXT = 'watching:list:next';
const COMPLETED_PREV = 'completed:list:prev';
const COMPLETED_NEXT = 'completed:list:next';

function listPageCount(count) {
    const total = Math.max(0, Math.floor(Number(count)) || 0);
    if (!total) return 1;
    return Math.ceil(total / LIST_PAGE_SIZE);
}

function listButtons(prevId, nextId, page, pages, disabled) {
    return pageButtons(prevId, nextId, page, pages, disabled);
}

function applyListClick(page, pages, customId, prevId, nextId) {
    const last = Math.max(0, pages - 1);
    const current = Math.min(Math.max(0, page), last);
    if (customId === prevId) return Math.max(0, current - 1);
    if (customId === nextId) return Math.min(last, current + 1);
    return current;
}

function buildPagedEmbed({
    title,
    lines,
    page = 0,
    empty = 'Nothing yet.',
    footerLabel = 'anime',
    prevId,
    nextId,
    disabled = false,
} = {}) {
    const items = Array.isArray(lines) ? lines : [];
    const pages = listPageCount(items.length);
    const safe = Math.min(Math.max(0, page), pages - 1);
    const slice = items.slice(safe * LIST_PAGE_SIZE, (safe * LIST_PAGE_SIZE) + LIST_PAGE_SIZE);
    const description = (slice.length ? slice.join('\n') : empty).slice(0, 4096);
    const showButtons = items.length > LIST_PAGE_SIZE;
    const count = items.length ? `${items.length} ${items.length === 1 ? 'show' : 'shows'}` : '';
    const embed = styledEmbed({
        title: title || 'List',
        description,
        label: footerLabel,
        extra: [count, pages > 1 ? `Page ${safe + 1} of ${pages}` : ''],
    });
    return {
        embeds: [embed],
        components: showButtons ? [listButtons(prevId, nextId, safe, pages, disabled)] : [],
        allowedMentions: allowedMentions(),
    };
}

function personName(user) {
    return neutralize(user && (user.globalName || user.username), 64) || 'User';
}

async function presentUserList(interaction, options) {
    await defer(interaction);
    const optionName = options.optionName || 'user';
    const requested = interaction.options && typeof interaction.options.getUser === 'function'
        ? interaction.options.getUser(optionName)
        : null;
    const target = requested || interaction.user;
    const viewerId = interaction.user && interaction.user.id;
    const targetId = target && target.id;
    const self = Boolean(snowflake(targetId) && snowflake(targetId) === snowflake(viewerId));
    let sameGuild = self;
    if (!self && requested && typeof interaction.options.getMember === 'function') {
        sameGuild = Boolean(interaction.options.getMember(optionName));
    }
    const decision = await profileForViewer(targetId, viewerId, { sameGuild });
    if (!decision.show) return finish(interaction, ephemeral(decision.message));

    let member = null;
    if (requested && typeof interaction.options.getMember === 'function') {
        member = interaction.options.getMember(optionName);
    }
    if (!member && decision.self) member = interaction.member || null;
    await noteIdentity(decision.profile, target, member);

    const items = options.lines(decision.profile) || [];
    const pages = listPageCount(items.length);
    let page = 0;
    const view = (disabled) => buildPagedEmbed({
        title: options.title(target),
        lines: items,
        page,
        empty: options.empty,
        footerLabel: options.footerLabel,
        prevId: options.prevId,
        nextId: options.nextId,
        disabled,
    });
    if (items.length <= LIST_PAGE_SIZE) return finish(interaction, view(false));

    const message = await replyMenu(interaction, view(false));
    return watchMenu({
        message,
        interaction,
        commandName: options.commandName,
        disabledView: () => view(true),
        onCollect: async (component) => {
            if (component.customId !== options.prevId && component.customId !== options.nextId) return false;
            page = applyListClick(page, pages, component.customId, options.prevId, options.nextId);
            await updateComponent(component, view(false));
            return false;
        },
    });
}

module.exports = {
    LIST_PAGE_SIZE,
    WATCHING_PREV,
    WATCHING_NEXT,
    COMPLETED_PREV,
    COMPLETED_NEXT,
    listPageCount,
    applyListClick,
    buildPagedEmbed,
    personName,
    presentUserList,
};
