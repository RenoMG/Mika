const { displayTitle } = require('./embed');
const { cleanDetails, mediaFacts, scoreText } = require('./details');
const { anilistId } = require('./ids');
const { neutralize } = require('./text');
const {
    applyWatching,
    bulletLine,
    byRecent,
    locateWatching,
    readWatching,
    storedDate,
} = require('./watching');

const MAX_COMPLETED = 2000;
const PROFILE_COMPLETED = 5;

const LEGACY_COMPLETE = "That saved line has no AniList id, so it can't be marked completed. Remove it with /watching remove.";
const COMPLETE_FULL = `Your completed list is full (${MAX_COMPLETED}). Remove one with /completed remove.`;

function completedEntry(id, title, extra = {}) {
    const details = cleanDetails(extra);
    delete details.completedAt;
    const row = {
        ...details,
        anilistId: id,
        title: neutralize(title, 200) || 'Anime',
        recommended: extra && extra.recommended === true,
    };
    const at = storedDate(extra && extra.completedAt);
    if (at) row.completedAt = at;
    return row;
}

function readCompleted(profile) {
    const stored = Array.isArray(profile && profile.completedList) ? profile.completedList : [];
    const list = [];
    for (const item of stored) {
        const id = anilistId(item && item.anilistId);
        if (!id || list.some((row) => row.anilistId === id)) continue;
        list.push(completedEntry(id, item && item.title, item));
        if (list.length >= MAX_COMPLETED) return list;
    }
    return list;
}

function recentCompleted(profile) {
    return byRecent(readCompleted(profile), 'completedAt');
}

function discordDate(value) {
    const at = storedDate(value);
    if (!at) return '';
    return `<t:${Math.floor(at.getTime() / 1000)}:d>`;
}

function completedListLines(profile) {
    return recentCompleted(profile).map((item) => {
        const score = scoreText(item.score);
        const line = bulletLine(item.title, item.recommended, 200, score ? `★${score}` : '');
        const stamp = discordDate(item.completedAt);
        return stamp ? `${line} · ${stamp}` : line;
    });
}

function profileCompletedLines(profile) {
    const recent = recentCompleted(profile);
    if (!recent.length) return [];
    const shown = recent.slice(0, PROFILE_COMPLETED);
    const lines = shown.map((item) => {
        const score = scoreText(item.score);
        return bulletLine(item.title, item.recommended, 80, score ? `★${score}` : '');
    });
    const more = recent.length - shown.length;
    if (more > 0) lines.push(`+${more} more · /completed list`);
    return lines;
}

function completedChoices(profile, query) {
    const needle = String(query || '').trim().toLowerCase();
    const choices = [];
    for (const item of recentCompleted(profile)) {
        const hay = `${item.title} ${item.anilistId}`.toLowerCase();
        if (needle && !hay.includes(needle)) continue;
        const mark = item.recommended ? '💌 ' : '';
        choices.push({ name: `${mark}${item.title}`.slice(0, 100), value: item.anilistId });
        if (choices.length >= 25) break;
    }
    return choices;
}

function applyCompleted(profile, list) {
    const next = [];
    for (const item of list || []) {
        const id = anilistId(item && item.anilistId);
        if (!id || next.some((row) => row.anilistId === id)) continue;
        next.push(completedEntry(id, item && item.title, item));
        if (next.length >= MAX_COMPLETED) break;
    }
    profile.completedList = next;
    if (typeof profile.markModified === 'function') profile.markModified('completedList');
    return next;
}

function placeCompleted(list, id, title, options = {}) {
    const at = storedDate(options.completedAt) || new Date();
    const index = list.findIndex((item) => item.anilistId === id);
    if (index >= 0) {
        const next = list.slice();
        const recommended = next[index].recommended || options.recommended === true;
        next[index] = completedEntry(id, title || next[index].title, {
            ...next[index],
            ...(options.details || {}),
            recommended,
            completedAt: at,
        });
        return { ok: true, list: next, redated: true, title: next[index].title };
    }
    if (list.length >= MAX_COMPLETED) return { ok: false, reason: 'full', list };
    const row = completedEntry(id, title, {
        ...(options.details || {}),
        recommended: options.recommended === true,
        completedAt: at,
    });
    return { ok: true, list: list.concat([row]), redated: false, title: row.title };
}

// A finished show has watched every episode when the total is known.
function finishedDetails(item) {
    const details = cleanDetails(item);
    delete details.completedAt;
    if (details.episodes) details.progress = details.episodes;
    return details;
}

function writeBoth(profile, watching, completed) {
    applyWatching(profile, watching);
    applyCompleted(profile, completed);
    return profile.save();
}

function completeFromWatching(profile, raw, now = new Date()) {
    const found = locateWatching(profile, raw);
    if (found.kind === 'legacy') return { ok: false, reason: 'legacy' };
    if (found.kind !== 'item') return { ok: false, reason: 'missing' };
    const item = found.list[found.index];
    const placed = placeCompleted(readCompleted(profile), item.anilistId, item.title, {
        recommended: item.recommended,
        completedAt: now,
        details: finishedDetails(item),
    });
    if (!placed.ok) return { ok: false, reason: 'full' };
    const watching = found.list.slice();
    watching.splice(found.index, 1);
    return {
        ok: true,
        watching,
        completed: placed.list,
        anilistId: item.anilistId,
        title: placed.title,
        redated: placed.redated,
        recommended: item.recommended === true,
    };
}

function addCompleted(profile, media, now = new Date()) {
    const id = anilistId(media && media.id);
    if (!id) return { ok: false, reason: 'missing' };
    const watching = readWatching(profile);
    const onList = watching.find((item) => item.anilistId === id);
    const title = onList
        ? onList.title
        : (neutralize(displayTitle(media), 200) || 'Anime');
    const placed = placeCompleted(readCompleted(profile), id, title, {
        recommended: Boolean(onList && onList.recommended),
        completedAt: now,
        details: finishedDetails({ ...mediaFacts(media), ...(onList || {}) }),
    });
    if (!placed.ok) return { ok: false, reason: 'full' };
    return {
        ok: true,
        watching: onList ? watching.filter((item) => item.anilistId !== id) : watching,
        completed: placed.list,
        anilistId: id,
        title: placed.title,
        redated: placed.redated,
        removedWatching: Boolean(onList),
    };
}

function removeCompleted(profile, raw) {
    const list = readCompleted(profile);
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { ok: false, reason: 'missing', list };
    let index = -1;
    const id = anilistId(text);
    if (id) index = list.findIndex((item) => item.anilistId === id);
    if (index < 0) {
        const folded = neutralize(text, 200).toLowerCase();
        if (folded) index = list.findIndex((item) => item.title.toLowerCase() === folded);
    }
    if (index < 0) return { ok: false, reason: 'missing', list };
    const next = list.slice();
    const removed = next.splice(index, 1)[0];
    return { ok: true, removed, list: next };
}

module.exports = {
    completedEntry,
    finishedDetails,
    MAX_COMPLETED,
    PROFILE_COMPLETED,
    LEGACY_COMPLETE,
    COMPLETE_FULL,
    readCompleted,
    recentCompleted,
    discordDate,
    completedListLines,
    profileCompletedLines,
    completedChoices,
    applyCompleted,
    writeBoth,
    completeFromWatching,
    addCompleted,
    removeCompleted,
};
