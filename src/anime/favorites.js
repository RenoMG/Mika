const { displayTitle } = require('./embed');
const { anilistId } = require('./ids');
const { neutralize } = require('./text');

const MAX_FAVORITES = 5;

function entry(id, title) {
    return {
        anilistId: id,
        title: neutralize(title, 200) || 'Anime',
    };
}

// The ordered top 5. An empty list falls back to the legacy single favorite
// without writing, so an old profile keeps its show until the owner edits it.
function readFavorites(profile) {
    const stored = Array.isArray(profile && profile.favorites) ? profile.favorites : [];
    const list = [];
    for (const item of stored) {
        const id = anilistId(item && item.anilistId);
        if (!id || list.some((row) => row.anilistId === id)) continue;
        list.push(entry(id, item && item.title));
        if (list.length >= MAX_FAVORITES) return list;
    }
    if (list.length) return list;
    const legacyId = anilistId(profile && profile.favoriteId) || '';
    const legacyTitle = neutralize(profile && profile.favoriteTitle, 200);
    if (!legacyId && !legacyTitle) return [];
    return [{ anilistId: legacyId, title: legacyTitle || 'Anime' }];
}

function addFavorite(profile, media) {
    const id = anilistId(media && media.id);
    if (!id) return { ok: false, reason: 'missing', list: readFavorites(profile) };
    const title = neutralize(displayTitle(media), 200) || 'Anime';
    const list = readFavorites(profile).filter((item) => anilistId(item.anilistId));
    if (list.some((item) => item.anilistId === id)) return { ok: false, reason: 'duplicate', list };
    if (list.length >= MAX_FAVORITES) return { ok: false, reason: 'full', list };
    return { ok: true, list: list.concat([entry(id, title)]) };
}

function removeFavorite(profile, raw) {
    const list = readFavorites(profile);
    const text = String(raw == null ? '' : raw).trim();
    let index = -1;
    const id = anilistId(text);
    if (id) index = list.findIndex((item) => item.anilistId === id);
    if (index < 0 && /^[1-5]$/.test(text)) index = Number(text) - 1;
    if (index < 0) {
        const folded = neutralize(text, 200).toLowerCase();
        if (folded) index = list.findIndex((item) => item.title.toLowerCase() === folded);
    }
    if (index < 0 || index >= list.length) return { ok: false, reason: 'missing', list };
    const next = list.slice();
    const removed = next.splice(index, 1)[0];
    return { ok: true, removed, list: next };
}

function reorderFavorites(profile, from, to) {
    const list = readFavorites(profile);
    const start = Number(from);
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end)) return { ok: false, reason: 'range', list };
    if (start < 1 || end < 1 || start > list.length || end > list.length) {
        return { ok: false, reason: 'range', list };
    }
    const next = list.slice();
    const [item] = next.splice(start - 1, 1);
    next.splice(end - 1, 0, item);
    return { ok: true, list: next, moved: item };
}

function clearFavorites() {
    return { ok: true, list: [] };
}

// Writes the list and mirrors the first row into the legacy fields so older
// readers stay in sync. Clearing is the owner's request, so an empty list
// clears that mirror too. Reading never calls this.
function applyFavorites(profile, list) {
    const next = (list || []).slice(0, MAX_FAVORITES).map((item) => entry(item.anilistId, item.title));
    profile.favorites = next;
    if (typeof profile.markModified === 'function') profile.markModified('favorites');
    const first = next[0];
    profile.favoriteId = first ? first.anilistId : '';
    profile.favoriteTitle = first ? first.title : '';
    return next;
}

function favoriteLabel(profile) {
    const list = readFavorites(profile);
    return list.length ? list[0].title : '';
}

module.exports = {
    MAX_FAVORITES,
    readFavorites,
    addFavorite,
    removeFavorite,
    reorderFavorites,
    clearFavorites,
    applyFavorites,
    favoriteLabel,
};
