const {
    GUESS_CACHE_TARGET,
    GUESS_CACHE_TTL_MS,
    GUESS_FRESH_CHANCE,
    GUESS_RECENT_LIMIT,
    GUESS_SHOWN_CAP,
} = require('./constants');

function animeKey(value) {
    if (value == null || typeof value === 'object') return null;
    const text = String(value);
    return /^\d{1,10}$/.test(text) ? text : null;
}

function planSource(count, roll) {
    const total = Math.max(0, Math.floor(Number(count)) || 0);
    if (total < GUESS_CACHE_TARGET) return 'fresh';
    const chance = Number(roll);
    const value = Number.isFinite(chance) ? Math.min(0.999999, Math.max(0, chance)) : 1;
    return value < GUESS_FRESH_CHANCE ? 'fresh' : 'cache';
}

function excludeRecent(ids, recent) {
    const skip = new Set((recent || []).map((id) => String(id)));
    const open = [];
    for (const id of ids || []) {
        const key = animeKey(id);
        if (!key) continue;
        if (!skip.has(key)) open.push(key);
    }
    return open;
}

function pickScreenshot(urls, already, random = Math.random) {
    const list = [];
    const seen = new Set();
    for (const url of urls || []) {
        if (typeof url !== 'string' || !url || seen.has(url)) continue;
        seen.add(url);
        list.push(url);
    }
    if (!list.length) return null;
    const used = new Set((already || []).filter((url) => seen.has(url)));
    let open = list.filter((url) => !used.has(url));
    let reset = false;
    if (!open.length) {
        open = list;
        reset = true;
    }
    const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    const url = open[Math.floor(roll * open.length)];
    const previous = reset ? [] : (already || []).filter((entry) => seen.has(entry) && entry !== url);
    return { url, shown: [...previous, url].slice(-list.length) };
}

function rememberUse(state, anilistId, shownUrls) {
    const id = animeKey(anilistId);
    const current = state || { recentIds: [], shown: [] };
    const recentIds = [id, ...(current.recentIds || []).filter((entry) => entry !== id)]
        .filter((entry) => animeKey(entry))
        .slice(0, GUESS_RECENT_LIMIT);
    const urls = [];
    const seen = new Set();
    for (const url of shownUrls || []) {
        if (typeof url !== 'string' || !url.startsWith('https://shikimori.io/') || seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
        if (urls.length >= 40) break;
    }
    const shown = [
        { animeId: id, urls },
        ...(current.shown || []).filter((entry) => entry && entry.animeId !== id && animeKey(entry.animeId)),
    ].slice(0, GUESS_SHOWN_CAP);
    return { recentIds, shown };
}

function isStale(fetchedAt, now) {
    const time = fetchedAt instanceof Date ? fetchedAt.getTime() : Date.parse(fetchedAt);
    if (!Number.isFinite(time)) return true;
    return now - time >= GUESS_CACHE_TTL_MS;
}

module.exports = {
    animeKey,
    planSource,
    excludeRecent,
    pickScreenshot,
    rememberUse,
    isStale,
};
