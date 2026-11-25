const { displayTitle } = require('./embed');
const {
    cleanDetails,
    cleanNotes,
    cleanScore,
    mediaFacts,
    progressText,
    scoreText,
    wholeNumber,
    EPISODES_MAX,
    REWATCH_MAX,
} = require('./details');
const { anilistId, snowflake } = require('./ids');
const { neutralize } = require('./text');
const { completedEntry, readCompleted, MAX_COMPLETED } = require('./completed');
const { byRecent, entry: watchingEntry, readWatching, storedDate, MAX_WATCHING } = require('./watching');

// Every status a show can have, in AniList's order. Watching and completed keep
// their original fields and helpers; the other four share one row shape.
const STATUSES = Object.freeze([
    { id: 'watching', label: 'Watching', emoji: '📺', field: 'watchingList', max: MAX_WATCHING, dateField: 'addedAt' },
    { id: 'planning', label: 'Planning', emoji: '🗓️', field: 'planningList', max: 500, dateField: 'addedAt' },
    { id: 'completed', label: 'Completed', emoji: '✅', field: 'completedList', max: MAX_COMPLETED, dateField: 'completedAt' },
    { id: 'rewatching', label: 'Rewatching', emoji: '🔁', field: 'rewatchingList', max: 50, dateField: 'addedAt' },
    { id: 'paused', label: 'Paused', emoji: '⏸️', field: 'pausedList', max: 200, dateField: 'addedAt' },
    { id: 'dropped', label: 'Dropped', emoji: '🗑️', field: 'droppedList', max: 500, dateField: 'addedAt' },
]);
const STATUS_IDS = STATUSES.map((status) => status.id);
const BY_ID = new Map(STATUSES.map((status) => [status.id, status]));
const SORTS = Object.freeze(['recent', 'score', 'title', 'progress']);

function statusInfo(id) {
    return BY_ID.get(id) || null;
}

function statusChoices() {
    return STATUSES.map((status) => ({ name: status.label, value: status.id }));
}

function libraryEntry(id, title, extra = {}) {
    const sender = snowflake(extra && extra.fromUserId);
    const row = {
        ...cleanDetails(extra),
        anilistId: id,
        title: neutralize(title, 200) || 'Anime',
        recommended: extra && extra.recommended === true,
        fromUserId: sender || '',
    };
    const added = storedDate(extra && extra.addedAt);
    if (added) row.addedAt = added;
    return row;
}

function rowFor(statusId, id, title, extra) {
    if (statusId === 'watching') return watchingEntry(id, title, extra);
    if (statusId === 'completed') return completedEntry(id, title, extra);
    return libraryEntry(id, title, extra);
}

function readGeneric(profile, status) {
    const stored = Array.isArray(profile && profile[status.field]) ? profile[status.field] : [];
    const list = [];
    for (const item of stored) {
        const id = anilistId(item && item.anilistId);
        if (!id || list.some((row) => row.anilistId === id)) continue;
        list.push(libraryEntry(id, item && item.title, item));
        if (list.length >= status.max) break;
    }
    return list;
}

// Storage order for one status.
function readList(profile, statusId) {
    if (statusId === 'watching') return readWatching(profile);
    if (statusId === 'completed') return readCompleted(profile);
    const status = statusInfo(statusId);
    return status ? readGeneric(profile, status) : [];
}

function readAll(profile) {
    const lists = {};
    for (const status of STATUSES) lists[status.id] = readList(profile, status.id);
    return lists;
}

// The status a show is on. A show is only ever on one; if older data has it on
// more than one, the first in STATUSES order wins.
function findEntry(profile, raw, lists = readAll(profile)) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return null;
    const id = anilistId(text);
    const folded = neutralize(text, 200).toLowerCase();
    for (const status of STATUSES) {
        const list = lists[status.id] || [];
        let index = id ? list.findIndex((item) => item.anilistId === id) : -1;
        if (index < 0 && folded) index = list.findIndex((item) => item.title.toLowerCase() === folded);
        if (index >= 0) return { status: status.id, index, entry: list[index], lists };
    }
    return null;
}

function writeList(profile, statusId, list) {
    const status = statusInfo(statusId);
    if (!status) return [];
    const next = [];
    for (const item of list || []) {
        const id = anilistId(item && item.anilistId);
        if (!id || next.some((row) => row.anilistId === id)) continue;
        next.push(rowFor(statusId, id, item && item.title, item));
        if (next.length >= status.max) break;
    }
    profile[status.field] = next;
    if (typeof profile.markModified === 'function') profile.markModified(status.field);
    return next;
}

function writeLists(profile, lists, only) {
    const keys = only ? [...new Set(only)] : STATUS_IDS;
    for (const key of keys) {
        if (lists[key]) writeList(profile, key, lists[key]);
    }
}

// Details for the row in its new status. Moving keeps progress, score, notes and
// dates, then applies what that status means: finishing sets every episode
// watched, finishing a rewatch counts one more rewatch, starting stamps a date.
function detailsForMove(from, to, row, now) {
    const details = { ...cleanDetails(row) };
    const at = now instanceof Date ? now : new Date(now);
    if (to === 'watching' && !details.startedAt) details.startedAt = at;
    if (to === 'rewatching') details.progress = 0;
    if (to === 'completed') {
        if (details.episodes) details.progress = details.episodes;
        details.completedAt = at;
        if (from === 'rewatching') details.rewatches = Math.min(REWATCH_MAX, (details.rewatches || 0) + 1);
        if (!details.startedAt && from !== 'planning') details.startedAt = row.addedAt || undefined;
    }
    details.updatedAt = at;
    return details;
}

function fullResult(statusId) {
    const status = statusInfo(statusId);
    return { ok: false, reason: 'full', status: statusId, max: status ? status.max : 0 };
}

// Puts a show on a status. `media` is a search result or a stored row. A show
// that is already somewhere else moves, keeping its details.
function setStatus(profile, media, statusId, options = {}) {
    const target = statusInfo(statusId);
    if (!target) return { ok: false, reason: 'status' };
    const id = anilistId(media && (media.anilistId || media.id));
    if (!id) return { ok: false, reason: 'missing' };
    const now = options.now || new Date();
    const lists = readAll(profile);
    const found = findEntry(profile, id, lists);
    if (found && found.status === statusId) return { ok: false, reason: 'same', status: statusId, entry: found.entry };
    const title = found
        ? found.entry.title
        : (neutralize(media.title || displayTitle(media), 200) || 'Anime');
    const base = found ? found.entry : { ...mediaFacts(media), addedAt: now };
    const list = lists[statusId];
    if (list.length >= target.max) return fullResult(statusId);
    const details = detailsForMove(found ? found.status : null, statusId, base, now);
    const row = rowFor(statusId, id, title, {
        ...base,
        ...details,
        ...(options.details || {}),
        recommended: base.recommended === true || options.recommended === true,
        fromUserId: base.fromUserId || options.fromUserId,
        addedAt: statusId === 'completed' ? base.addedAt : now,
        completedAt: details.completedAt || base.completedAt,
    });
    const touched = [statusId];
    if (found) {
        lists[found.status] = lists[found.status].filter((item) => item.anilistId !== id);
        touched.push(found.status);
    }
    lists[statusId] = list.concat([row]);
    writeLists(profile, lists, touched);
    return { ok: true, status: statusId, from: found ? found.status : null, entry: row, title };
}

function removeEntry(profile, raw) {
    const found = findEntry(profile, raw);
    if (!found) return { ok: false, reason: 'missing' };
    const lists = found.lists;
    lists[found.status] = lists[found.status].filter((item) => item.anilistId !== found.entry.anilistId);
    writeLists(profile, lists, [found.status]);
    return { ok: true, status: found.status, entry: found.entry };
}

// Edits details in place. Reaching the last episode of a show being watched or
// rewatched finishes it, the same way AniList does.
function editEntry(profile, raw, patch = {}, options = {}) {
    const found = findEntry(profile, raw);
    if (!found) return { ok: false, reason: 'missing' };
    const now = options.now || new Date();
    const row = { ...found.entry };
    const changed = [];
    if (patch.progress != null) {
        const value = wholeNumber(patch.progress, 0, EPISODES_MAX);
        if (value == null) return { ok: false, reason: 'progress' };
        row.progress = row.episodes ? Math.min(value, row.episodes) : value;
        changed.push('progress');
    }
    if (patch.addProgress != null) {
        const step = wholeNumber(patch.addProgress, -EPISODES_MAX, EPISODES_MAX);
        if (step == null) return { ok: false, reason: 'progress' };
        let value = Math.max(0, (row.progress || 0) + step);
        if (row.episodes) value = Math.min(value, row.episodes);
        row.progress = value;
        changed.push('progress');
    }
    if (patch.score != null) {
        if (Number(patch.score) === 0) {
            delete row.score;
        } else {
            const value = cleanScore(patch.score);
            if (!value) return { ok: false, reason: 'score' };
            row.score = value;
        }
        changed.push('score');
    }
    if (patch.notes != null) {
        const text = String(patch.notes);
        if (!text.trim() || text.trim() === '-') {
            delete row.notes;
        } else {
            const clean = cleanNotes(text);
            if (!clean) return { ok: false, reason: 'notes' };
            row.notes = clean;
        }
        changed.push('notes');
    }
    if (patch.startedAt !== undefined) {
        if (patch.startedAt) row.startedAt = patch.startedAt;
        else delete row.startedAt;
        changed.push('startedAt');
    }
    if (patch.completedAt !== undefined) {
        if (patch.completedAt) row.completedAt = patch.completedAt;
        else delete row.completedAt;
        changed.push('completedAt');
    }
    if (patch.rewatches != null) {
        const value = wholeNumber(patch.rewatches, 0, REWATCH_MAX);
        if (value == null) return { ok: false, reason: 'rewatches' };
        row.rewatches = value;
        changed.push('rewatches');
    }
    if (!changed.length) return { ok: false, reason: 'nothing' };
    row.updatedAt = now;
    if (!row.progress) delete row.progress;
    if (!row.rewatches) delete row.rewatches;
    const lists = found.lists;
    lists[found.status] = lists[found.status].map((item) => (item.anilistId === row.anilistId ? row : item));
    writeLists(profile, lists, [found.status]);
    const finishes = changed.includes('progress')
        && (found.status === 'watching' || found.status === 'rewatching')
        && row.episodes && row.progress >= row.episodes;
    if (finishes) {
        const moved = setStatus(profile, row, 'completed', { now });
        if (moved.ok) return { ok: true, status: 'completed', from: found.status, finished: true, entry: moved.entry, changed };
    }
    return { ok: true, status: found.status, entry: row, changed };
}

function sortEntries(list, sort, statusId) {
    const status = statusInfo(statusId);
    const recent = byRecent(list, status ? status.dateField : 'addedAt');
    if (sort === 'title') return recent.slice().sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'score') {
        return recent.slice().sort((a, b) => (cleanScore(b.score) || 0) - (cleanScore(a.score) || 0));
    }
    if (sort === 'progress') return recent.slice().sort((a, b) => (b.progress || 0) - (a.progress || 0));
    return recent;
}

function entryLine(item, { status, showStatus = false, max = 120 } = {}) {
    const title = neutralize(item && item.title, max) || 'Anime';
    const parts = [];
    const info = showStatus && statusInfo(status);
    const lead = info ? `${info.emoji} ` : '• ';
    const mark = item && item.recommended ? '💌 ' : '';
    const progress = status === 'completed' ? '' : progressText(item);
    if (progress) parts.push(progress);
    const score = scoreText(item && item.score);
    if (score) parts.push(`★${score}`);
    if (item && item.rewatches) parts.push(`🔁${item.rewatches}`);
    const tail = parts.length ? ` · ${parts.join(' · ')}` : '';
    return `${lead}${mark}${title}${tail}`;
}

// Rows for a paged list. `statusId` 'all' groups every status, newest first in each.
function libraryLines(profile, statusId = 'all', sort = 'recent') {
    const lists = readAll(profile);
    if (statusId !== 'all') {
        return sortEntries(lists[statusId] || [], sort, statusId).map((item) => entryLine(item, { status: statusId }));
    }
    const rows = [];
    for (const status of STATUSES) {
        for (const item of sortEntries(lists[status.id], sort, status.id)) {
            rows.push({ item, status: status.id });
        }
    }
    if (sort === 'title') rows.sort((a, b) => a.item.title.localeCompare(b.item.title));
    if (sort === 'score') rows.sort((a, b) => (cleanScore(b.item.score) || 0) - (cleanScore(a.item.score) || 0));
    if (sort === 'progress') rows.sort((a, b) => (b.item.progress || 0) - (a.item.progress || 0));
    return rows.map((row) => entryLine(row.item, { status: row.status, showStatus: true }));
}

function libraryChoices(profile, query, { statuses = STATUS_IDS } = {}) {
    const needle = String(query || '').trim().toLowerCase();
    const lists = readAll(profile);
    const choices = [];
    for (const status of STATUSES) {
        if (!statuses.includes(status.id)) continue;
        for (const item of byRecent(lists[status.id], status.dateField)) {
            const hay = `${item.title} ${item.anilistId}`.toLowerCase();
            if (needle && !hay.includes(needle)) continue;
            choices.push({ name: `${status.emoji} ${item.title}`.slice(0, 100), value: item.anilistId });
            if (choices.length >= 25) return choices;
        }
    }
    return choices;
}

function counts(profile) {
    const lists = readAll(profile);
    const out = {};
    for (const status of STATUSES) out[status.id] = lists[status.id].length;
    return out;
}

module.exports = {
    STATUSES,
    STATUS_IDS,
    SORTS,
    statusInfo,
    statusChoices,
    libraryEntry,
    readList,
    readAll,
    findEntry,
    writeList,
    writeLists,
    setStatus,
    removeEntry,
    editEntry,
    sortEntries,
    entryLine,
    libraryLines,
    libraryChoices,
    counts,
};
