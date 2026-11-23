const { displayTitle } = require('./embed');
const { anilistId, snowflake } = require('./ids');
const { neutralize } = require('./text');

const MAX_WATCHING = 20;
const PROFILE_WATCHING = 5;
const LEGACY_TOKEN = 'legacy';
const POSITION = /^(?:[1-9]|1\d|20)$/;

function storedDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
}

// A real timestamp sorts ahead of any missing one. A missing date uses the
// array index, and a later index is newer. Indexes stay far below Date.now().
function recencyScore(value, index) {
    const at = storedDate(value);
    if (at) return at.getTime();
    const pos = Number.isInteger(index) && index >= 0 ? index : 0;
    return pos;
}

function byRecent(list, dateField) {
    return (list || [])
        .map((item, index) => ({
            item,
            index,
            score: recencyScore(item && item[dateField], index),
        }))
        .sort((a, b) => (b.score - a.score) || (b.index - a.index))
        .map((row) => row.item);
}

function entry(id, title, extra = {}) {
    const sender = snowflake(extra && extra.fromUserId);
    const row = {
        anilistId: id,
        title: neutralize(title, 200) || 'Anime',
        recommended: extra && extra.recommended === true,
        fromUserId: sender || '',
    };
    const added = storedDate(extra && extra.addedAt);
    if (added) row.addedAt = added;
    return row;
}

// Storage order, oldest first when every row was appended. The old free-text
// `watching` string is not part of this list and is not rewritten here.
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

function recentWatching(profile) {
    return byRecent(readWatching(profile), 'addedAt');
}

function legacyWatching(profile) {
    return neutralize(profile && profile.watching, 200);
}

function bulletLine(title, recommended, max = 80) {
    const text = neutralize(title, max) || 'Anime';
    const mark = recommended ? '💌 ' : '';
    return `• ${mark}${text}`;
}

function watchingLines(profile) {
    const lines = recentWatching(profile).map((item) => bulletLine(item.title, item.recommended, 200));
    const legacy = legacyWatching(profile);
    if (legacy) lines.push(bulletLine(legacy, false, 200));
    return lines;
}

function profileWatchingLines(profile) {
    const recent = recentWatching(profile);
    const shown = recent.slice(0, PROFILE_WATCHING);
    const lines = shown.map((item) => bulletLine(item.title, item.recommended));
    const legacy = legacyWatching(profile);
    if (legacy) lines.push(bulletLine(legacy, false));
    const more = recent.length - shown.length;
    if (more > 0) lines.push(`+${more} more · /watching list`);
    return lines;
}

function watchingLabel(profile) {
    const list = recentWatching(profile);
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
            addedAt: list[index].addedAt,
        });
        return { ok: true, reason: 'marked', list: next };
    }
    if (list.length >= MAX_WATCHING) return { ok: false, reason: 'full', list };
    const title = neutralize(displayTitle(media), 200) || 'Anime';
    const when = storedDate(options.addedAt) || new Date();
    return {
        ok: true,
        reason: 'added',
        list: list.concat([entry(id, title, { recommended, fromUserId: options.fromUserId, addedAt: when })]),
    };
}

function locateWatching(profile, raw) {
    const list = readWatching(profile);
    const legacy = legacyWatching(profile);
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { kind: 'missing', list, legacy };
    if (text === LEGACY_TOKEN) return { kind: legacy ? 'legacy' : 'missing', list, legacy };
    let index = -1;
    const id = anilistId(text);
    if (id) index = list.findIndex((item) => item.anilistId === id);
    // A number is the stored position, not the on-screen order. The list is
    // not numbered. 1 is the oldest saved row when nothing has been removed.
    if (index < 0 && POSITION.test(text)) index = Number(text) - 1;
    if (index >= 0) {
        if (index < list.length) return { kind: 'item', index, list, legacy };
        return { kind: 'missing', list, legacy };
    }
    const folded = neutralize(text, 200).toLowerCase();
    if (folded) {
        index = list.findIndex((item) => item.title.toLowerCase() === folded);
        if (index >= 0) return { kind: 'item', index, list, legacy };
        if (legacy.toLowerCase() === folded) return { kind: 'legacy', list, legacy };
    }
    return { kind: 'missing', list, legacy };
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
    const found = locateWatching(profile, raw);
    if (found.kind === 'legacy') return removeLegacy(found.list, found.legacy);
    if (found.kind !== 'item') return { ok: false, reason: 'missing', list: found.list, clearLegacy: false };
    const next = found.list.slice();
    const removed = next.splice(found.index, 1)[0];
    return { ok: true, removed, list: next, clearLegacy: false };
}

function clearWatching(profile) {
    return { ok: true, list: [], clearLegacy: false, legacy: legacyWatching(profile) };
}

// Writes the ordered list. The free-text field is cleared only when the owner
// removes that legacy line. Reading never calls this. Rows without addedAt
// stay without one.
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
    PROFILE_WATCHING,
    LEGACY_TOKEN,
    storedDate,
    byRecent,
    readWatching,
    recentWatching,
    legacyWatching,
    bulletLine,
    watchingLines,
    profileWatchingLines,
    watchingLabel,
    locateWatching,
    addWatching,
    removeWatching,
    clearWatching,
    applyWatching,
};
