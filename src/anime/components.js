const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const { displayTitle } = require('./embed');
const { neutralize } = require('./text');

const SEARCH_ID = 'anime:search';
const GENRE_ID = 'genres:pick';
const TAG_ID = 'genres:tags';
const GENRE_PREV = 'genres:prev';
const GENRE_NEXT = 'genres:next';
const DELETE_ID = 'profile:delete';
const DELETE_YES = 'profile:delete:yes';
const DELETE_NO = 'profile:delete:no';
const PAGE_SIZE = 25;
const MAX_GENRES = 10;

function optionDescription(media) {
    const bits = [];
    if (media && media.score != null) bits.push(`${media.score}/100`);
    if (media && media.startDate && media.startDate.year) bits.push(String(media.startDate.year));
    const genres = (media && media.genres || []).slice(0, 2).join(', ');
    if (genres) bits.push(genres);
    return (bits.join(' · ') || (media && media.source) || 'Anime').slice(0, 100);
}

function buildSearchRow(results, { disabled = false } = {}) {
    const seen = new Set();
    const options = [];
    for (const media of results || []) {
        const value = media && media.id != null ? String(media.id).slice(0, 100) : '';
        if (!value || seen.has(value)) continue;
        seen.add(value);
        options.push({
            label: (neutralize(displayTitle(media), 100) || 'Anime').slice(0, 100),
            value,
            description: optionDescription(media),
        });
        if (options.length >= 10) break;
    }
    if (!options.length) return [];
    const menu = new StringSelectMenuBuilder()
        .setCustomId(SEARCH_ID)
        .setPlaceholder('Choose an anime')
        .setDisabled(disabled)
        .addOptions(options);
    return [new ActionRowBuilder().addComponents(menu)];
}

function genrePages(all) {
    const list = Array.isArray(all) ? all : [];
    return Math.max(1, Math.ceil(list.length / PAGE_SIZE));
}

function genreSlice(all, page) {
    const list = Array.isArray(all) ? all : [];
    const pages = genrePages(list);
    const safe = Math.min(Math.max(0, page), pages - 1);
    return { page: safe, pages, names: list.slice(safe * PAGE_SIZE, safe * PAGE_SIZE + PAGE_SIZE) };
}

function mergeGenres(previous, pageNames, picked, limit = MAX_GENRES) {
    const onPage = new Set(pageNames);
    const next = [];
    const cap = Number.isInteger(limit) ? Math.max(0, limit) : MAX_GENRES;
    for (const name of picked || []) {
        if (onPage.has(name) && !next.includes(name)) next.push(name);
    }
    for (const name of previous || []) {
        if (!onPage.has(name) && !next.includes(name)) next.push(name);
    }
    return next.slice(0, cap);
}

function capTaste(genres, tags) {
    const nextGenres = [];
    for (const name of genres || []) {
        if (typeof name !== 'string' || !name || nextGenres.includes(name)) continue;
        if (nextGenres.length >= MAX_GENRES) break;
        nextGenres.push(name);
    }
    const nextTags = [];
    for (const name of tags || []) {
        if (typeof name !== 'string' || !name || nextTags.includes(name)) continue;
        if (nextGenres.length + nextTags.length >= MAX_GENRES) break;
        nextTags.push(name);
    }
    return { genres: nextGenres, tags: nextTags };
}

function applyTaste(state, { customId, pageNames, picked, genreNames, tagNames }) {
    const genres = Array.isArray(state && state.genres) ? state.genres : [];
    const tags = Array.isArray(state && state.tags) ? state.tags : [];
    if (customId === TAG_ID) {
        const known = new Set(tagNames || []);
        const clean = (picked || []).filter((name) => known.has(name));
        return {
            genres,
            tags: mergeGenres(tags, pageNames, clean, Math.max(0, MAX_GENRES - genres.length)),
        };
    }
    if (customId === GENRE_ID) {
        const known = new Set(genreNames || []);
        const clean = (picked || []).filter((name) => known.has(name));
        return {
            genres: mergeGenres(genres, pageNames, clean, Math.max(0, MAX_GENRES - tags.length)),
            tags,
        };
    }
    return null;
}

function buildGenreRows(all, page, selected, {
    disabled = false,
    limit = MAX_GENRES,
    customId = GENRE_ID,
    placeholder = 'Favorite genres',
} = {}) {
    const { page: safe, pages, names } = genreSlice(all, page);
    if (!names.length) return [];
    const chosen = (selected || []).filter((name) => names.includes(name));
    const room = Number.isInteger(limit) ? Math.max(0, limit) : MAX_GENRES;
    const cap = Math.min(names.length, Math.max(chosen.length, room));
    const maxValues = Math.max(1, Math.min(25, cap || 1));
    const defaults = chosen.slice(0, maxValues);
    const noRoom = room < 1 && defaults.length === 0;
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder((noRoom ? 'Remove one to add more' : placeholder).slice(0, 150))
        .setMinValues(0)
        .setMaxValues(maxValues)
        .setDisabled(disabled || noRoom)
        .addOptions(names.map((name) => ({
            label: name.slice(0, 100),
            value: name.slice(0, 100),
            default: defaults.includes(name),
        })));
    const rows = [new ActionRowBuilder().addComponents(menu)];
    if (pages > 1) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(GENRE_PREV)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || safe === 0),
            new ButtonBuilder()
                .setCustomId(GENRE_NEXT)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled || safe >= pages - 1),
        ));
    }
    return rows;
}

function buildTasteRows(genres, tags, state, { disabled = false } = {}) {
    const genreNames = Array.isArray(state && state.genres) ? state.genres : [];
    const tagNames = Array.isArray(state && state.tags) ? state.tags : [];
    const genreRows = buildGenreRows(genres, state && state.page, genreNames, {
        disabled,
        limit: Math.max(0, MAX_GENRES - tagNames.length),
    });
    const rows = [];
    if (genreRows[0]) rows.push(genreRows[0]);
    if (Array.isArray(tags) && tags.length) {
        const tagRows = buildGenreRows(tags, 0, tagNames, {
            disabled,
            limit: Math.max(0, MAX_GENRES - genreNames.length),
            customId: TAG_ID,
            placeholder: 'Favorite tags',
        });
        if (tagRows[0]) rows.push(tagRows[0]);
    }
    if (genreRows[1]) rows.push(genreRows[1]);
    return rows.slice(0, 5);
}

function deleteRow({ disabled = false, confirm = false } = {}) {
    if (confirm) {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(DELETE_YES).setLabel('Delete my profile').setStyle(ButtonStyle.Danger).setDisabled(disabled),
            new ButtonBuilder().setCustomId(DELETE_NO).setLabel('Keep it').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        )];
    }
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(DELETE_ID).setLabel('Delete my profile').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    )];
}

function recommendRow(publicId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rec:a:${publicId}`).setLabel('Accept').setStyle(ButtonStyle.Success).setDisabled(disabled),
        new ButtonBuilder().setCustomId(`rec:d:${publicId}`).setLabel('Decline').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    );
}

module.exports = {
    SEARCH_ID,
    GENRE_ID,
    TAG_ID,
    GENRE_PREV,
    GENRE_NEXT,
    DELETE_ID,
    DELETE_YES,
    DELETE_NO,
    PAGE_SIZE,
    MAX_GENRES,
    buildSearchRow,
    genreSlice,
    mergeGenres,
    capTaste,
    applyTaste,
    buildGenreRows,
    buildTasteRows,
    deleteRow,
    recommendRow,
};
