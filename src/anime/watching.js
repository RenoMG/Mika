const { displayTitle } = require('./embed');
const { anilistId, snowflake } = require('./ids');
const { neutralize } = require('./text');

const MAX_WATCHING = 10;
const LEGACY_TOKEN = 'legacy';

function entry(id, title, extra = {}) {
    const sender = snowflake(extra && extra.fromUserId);
    return {
        anilistId: id,
        title: neutralize(title, 200) || 'Anime',
        recommended: extra && extra.recommended === true,
        fromUserId: sender || '',
    };
}

// The ordered list of up to 10. The old free-text `watching` string is not
// part of this list and is not rewritten here.
function readWatching(profile) {
    const stored = Array.isArray(profile && profile.watchingList) ? profile.watchingList : [];
    const list = [];
    for (const item of stored) {
        const id = anilistId(item && item.anilistId);
        if (!id || list.some((row) => row.anilistId === id)) continue;
        list.push(entry(id, item && item.title, item));
        if (list.length >= MAX_WATCHING) return list;
    }
    return list;
}

function legacyWatching(profile) {
    return neutralize(profile && profile.watching, 200);
}

function watchingLines(profile) {
    const list = readWatching(profile);
    const lines = list.map((item, index) => {
        const title = neutralize(item.title, 80) || 'Anime';
        const mark = item.recommended ? '💌 ' : '';
        return `${index + 1}. ${mark}${title}`;
    });
    const legacy = legacyWatching(profile);
    if (!legacy) return lines;
    if (!lines.length) return [legacy];
    return lines.concat(legacy);
}

function watchingLabel(profile) {
    const list = readWatching(profile);
    if (list.length) return list[0].title;
    return legacyWatching(profile);
}

function addWatching(profile, media, options = {}) {
    const list = readWatching(profile);
    const id = anilistId(media && media.id);
    if (!id) return { ok: false, reason: 'missing', list };
    const recommended = options.recommended === true;
    const index = list.findIndex((item) => item.anilistId === id);
    if (index >= 0) {
        if (!recommended || list[index].recommended) {
            return { ok: false, reason: 'duplicate', list };
        }
        const next = list.slice();
        next[index] = entry(id, list[index].title, {
            recommended: true,
            fromUserId: options.fromUserId || list[index].fromUserId,
        });
        return { ok: true, reason: 'marked', list: next };
    }
    if (list.length >= MAX_WATCHING) return { ok: false, reason: 'full', list };
    const title = neutralize(displayTitle(media), 200) || 'Anime';
    return {
        ok: true,
        reason: 'added',
        list: list.concat([entry(id, title, { recommended, fromUserId: options.fromUserId })]),
    };
}

function removeLegacy(list, legacy) {
    return {
        ok: true,
        removed: { anilistId: LEGACY_TOKEN, title: legacy, legacy: true },
        list,
        clearLegacy: true,
    };
}

function removeWatching(profile, raw) {
    const list = readWatching(profile);
    const legacy = legacyWatching(profile);
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, reason: 'missing', list, clearLegacy: false };
    if (text === LEGACY_TOKEN) {
        if (!legacy) return { ok: false, reason: 'missing', list, clearLegacy: false };
        return removeLegacy(list, legacy);
    }
    let index = -1;
    const id = anilistId(text);
    if (id) index = list.findIndex((item) => item.anilistId === id);
    if (index < 0 && /^(?:[1-9]|10)$/.test(text)) index = Number(text) - 1;
    if (index < 0) {
        const folded = neutralize(text, 200).toLowerCase();
        if (folded) index = list.findIndex((item) => item.title.toLowerCase() === folded);
        if (index < 0 && folded && legacy.toLowerCase() === folded) return removeLegacy(list, legacy);
    }
    if (index < 0 || index >= list.length) return { ok: false, reason: 'missing', list, clearLegacy: false };
    const next = list.slice();
    const removed = next.splice(index, 1)[0];
    return { ok: true, removed, list: next, clearLegacy: false };
}

function clearWatching(profile) {
    return { ok: true, list: [], clearLegacy: false, legacy: legacyWatching(profile) };
}

// Writes the ordered list. The free-text field is cleared only when the owner
// removes that legacy line. Reading never calls this.
function applyWatching(profile, list, options = {}) {
    const next = [];
    for (const item of list || []) {
        const id = anilistId(item && item.anilistId);
        if (!id || next.some((row) => row.anilistId === id)) continue;
        next.push(entry(id, item && item.title, item));
        if (next.length >= MAX_WATCHING) break;
    }
    profile.watchingList = next;
    if (typeof profile.markModified === 'function') profile.markModified('watchingList');
    if (options.clearLegacy) profile.watching = '';
    return next;
}

module.exports = {
    MAX_WATCHING,
    LEGACY_TOKEN,
    readWatching,
    legacyWatching,
    watchingLines,
    watchingLabel,
    addWatching,
    removeWatching,
    clearWatching,
    applyWatching,
};
