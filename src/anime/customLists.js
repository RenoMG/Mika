const crypto = require('node:crypto');
const { displayTitle } = require('./embed');
const { anilistId } = require('./ids');
const { containsSlur, neutralize } = require('./text');

// Named lists a person makes themselves ("Comfort shows", "Winter 2026"). A
// show can be on any number of them, independent of its watch status.
const MAX_LISTS = 10;
const MAX_LIST_ENTRIES = 100;
const NAME_MAX = 40;
const ID_RE = /^[a-f0-9]{8}$/;

function cleanListName(value) {
    if (typeof value !== 'string') return '';
    const text = neutralize(value.normalize('NFKC'), NAME_MAX);
    if (!text || containsSlur(text)) return '';
    return text;
}

function listRow(item) {
    const id = typeof (item && item.id) === 'string' && ID_RE.test(item.id) ? item.id : null;
    const name = cleanListName(item && item.name);
    if (!id || !name) return null;
    const entries = [];
    for (const row of Array.isArray(item.entries) ? item.entries : []) {
        const showId = anilistId(row && row.anilistId);
        if (!showId || entries.some((entry) => entry.anilistId === showId)) continue;
        entries.push({ anilistId: showId, title: neutralize(row && row.title, 200) || 'Anime' });
        if (entries.length >= MAX_LIST_ENTRIES) break;
    }
    const out = { id, name, entries };
    if (item.createdAt instanceof Date && !Number.isNaN(item.createdAt.getTime())) out.createdAt = item.createdAt;
    return out;
}

function readCustomLists(profile) {
    const stored = Array.isArray(profile && profile.customLists) ? profile.customLists : [];
    const lists = [];
    for (const item of stored) {
        const row = listRow(item);
        if (!row || lists.some((list) => list.id === row.id || list.name.toLowerCase() === row.name.toLowerCase())) continue;
        lists.push(row);
        if (lists.length >= MAX_LISTS) break;
    }
    return lists;
}

function applyCustomLists(profile, lists) {
    const next = [];
    for (const item of lists || []) {
        const row = listRow(item);
        if (!row || next.some((list) => list.id === row.id)) continue;
        next.push(row);
        if (next.length >= MAX_LISTS) break;
    }
    profile.customLists = next;
    if (typeof profile.markModified === 'function') profile.markModified('customLists');
    return next;
}

function findList(lists, raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return -1;
    if (ID_RE.test(text)) {
        const index = lists.findIndex((list) => list.id === text);
        if (index >= 0) return index;
    }
    const folded = neutralize(text, NAME_MAX).toLowerCase();
    return lists.findIndex((list) => list.name.toLowerCase() === folded);
}

function newId(lists, random = crypto.randomBytes) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const id = random(4).toString('hex');
        if (!lists.some((list) => list.id === id)) return id;
    }
    return null;
}

function createList(profile, rawName, now = new Date()) {
    const lists = readCustomLists(profile);
    const name = cleanListName(rawName);
    if (!name) return { ok: false, reason: 'name', lists };
    if (lists.length >= MAX_LISTS) return { ok: false, reason: 'full', lists };
    if (findList(lists, name) >= 0) return { ok: false, reason: 'duplicate', lists };
    const id = newId(lists);
    if (!id) return { ok: false, reason: 'name', lists };
    const row = { id, name, entries: [], createdAt: now };
    return { ok: true, lists: lists.concat([row]), list: row };
}

function deleteList(profile, raw) {
    const lists = readCustomLists(profile);
    const index = findList(lists, raw);
    if (index < 0) return { ok: false, reason: 'missing', lists };
    const next = lists.slice();
    const removed = next.splice(index, 1)[0];
    return { ok: true, lists: next, list: removed };
}

function renameList(profile, raw, rawName) {
    const lists = readCustomLists(profile);
    const index = findList(lists, raw);
    if (index < 0) return { ok: false, reason: 'missing', lists };
    const name = cleanListName(rawName);
    if (!name) return { ok: false, reason: 'name', lists };
    const other = findList(lists, name);
    if (other >= 0 && other !== index) return { ok: false, reason: 'duplicate', lists };
    const next = lists.map((list, at) => (at === index ? { ...list, name } : list));
    return { ok: true, lists: next, list: next[index], oldName: lists[index].name };
}

function addToList(profile, raw, media) {
    const lists = readCustomLists(profile);
    const index = findList(lists, raw);
    if (index < 0) return { ok: false, reason: 'missing', lists };
    const id = anilistId(media && (media.anilistId || media.id));
    if (!id) return { ok: false, reason: 'anime', lists };
    const list = lists[index];
    if (list.entries.some((entry) => entry.anilistId === id)) return { ok: false, reason: 'duplicate', lists, list };
    if (list.entries.length >= MAX_LIST_ENTRIES) return { ok: false, reason: 'full', lists, list };
    const title = neutralize(media.title || displayTitle(media), 200) || 'Anime';
    const next = lists.map((item, at) => (at === index
        ? { ...item, entries: item.entries.concat([{ anilistId: id, title }]) }
        : item));
    return { ok: true, lists: next, list: next[index], title };
}

function removeFromList(profile, raw, rawAnime) {
    const lists = readCustomLists(profile);
    const index = findList(lists, raw);
    if (index < 0) return { ok: false, reason: 'missing', lists };
    const list = lists[index];
    const text = String(rawAnime == null ? '' : rawAnime).trim();
    const id = anilistId(text);
    let at = id ? list.entries.findIndex((entry) => entry.anilistId === id) : -1;
    if (at < 0 && text) {
        const folded = neutralize(text, 200).toLowerCase();
        at = list.entries.findIndex((entry) => entry.title.toLowerCase() === folded);
    }
    if (at < 0) return { ok: false, reason: 'anime', lists, list };
    const entries = list.entries.slice();
    const removed = entries.splice(at, 1)[0];
    const next = lists.map((item, pos) => (pos === index ? { ...item, entries } : item));
    return { ok: true, lists: next, list: next[index], removed };
}

function listChoices(profile, query) {
    const needle = String(query || '').trim().toLowerCase();
    return readCustomLists(profile)
        .filter((list) => !needle || list.name.toLowerCase().includes(needle))
        .slice(0, 25)
        .map((list) => ({ name: `${list.name} (${list.entries.length})`.slice(0, 100), value: list.id }));
}

function entryChoices(profile, rawList, query) {
    const lists = readCustomLists(profile);
    const index = findList(lists, rawList);
    if (index < 0) return [];
    const needle = String(query || '').trim().toLowerCase();
    return lists[index].entries
        .filter((entry) => !needle || `${entry.title} ${entry.anilistId}`.toLowerCase().includes(needle))
        .slice(0, 25)
        .map((entry) => ({ name: entry.title.slice(0, 100), value: entry.anilistId }));
}

module.exports = {
    MAX_LISTS,
    MAX_LIST_ENTRIES,
    NAME_MAX,
    cleanListName,
    readCustomLists,
    applyCustomLists,
    findList,
    createList,
    deleteList,
    renameList,
    addToList,
    removeFromList,
    listChoices,
    entryChoices,
};
