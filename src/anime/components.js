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

function mergeGenres(previous, pageNames, picked) {
    const onPage = new Set(pageNames);
    const next = [];
    for (const name of picked || []) {
        if (onPage.has(name) && !next.includes(name)) next.push(name);
    }
    for (const name of previous || []) {
        if (!onPage.has(name) && !next.includes(name)) next.push(name);
    }
    return next.slice(0, MAX_GENRES);
}

function buildGenreRows(all, page, selected, { disabled = false } = {}) {
    const { page: safe, pages, names } = genreSlice(all, page);
    if (!names.length) return [];
    const maxValues = Math.min(MAX_GENRES, names.length);
    const chosen = (selected || []).filter((name) => names.includes(name)).slice(0, maxValues);
    const menu = new StringSelectMenuBuilder()
        .setCustomId(GENRE_ID)
        .setPlaceholder('Favorite genres')
        .setMinValues(0)
        .setMaxValues(maxValues)
        .setDisabled(disabled)
        .addOptions(names.map((name) => ({
            label: name.slice(0, 100),
            value: name.slice(0, 100),
            default: chosen.includes(name),
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
    buildGenreRows,
    deleteRow,
    recommendRow,
};
