const { randomAnime, getAnime } = require('../anime/client');
const { snowflake } = require('../utils/safeId');
const { GUESS_ATTEMPTS, GUESS_CACHE_TARGET, GUESS_FRESH_CHANCE } = require('./constants');
const { animeKey, excludeRecent } = require('./policy');
const { fetchScreenshots, malKey } = require('./shikimori');
const store = require('./store');

async function defaultRandomAnime() {
    try {
        return await randomAnime();
    } catch (error) {
        return { ok: false, unavailable: true };
    }
}

async function defaultGetAnime(id) {
    try {
        return await getAnime(id, { fresh: true });
    } catch (error) {
        return null;
    }
}

async function refreshAnime(doc, deps, clock) {
    const get = deps.getAnime || defaultGetAnime;
    const fetchShots = deps.fetchScreenshots || fetchScreenshots;
    let media = null;
    try {
        media = await get(doc.anilistId, { fresh: true });
    } catch (error) {
        return null;
    }
    if (!media || media.isAdult === true || !malKey(media.idMal)) return null;
    let shots = null;
    try {
        shots = await fetchShots(media.idMal, { fresh: true });
    } catch (error) {
        return null;
    }
    if (!shots || shots.down || !shots.ok || !Array.isArray(shots.urls) || !shots.urls.length) return null;
    try {
        return await store.saveAnime(media, shots.urls, clock());
    } catch (error) {
        return null;
    }
}

async function fetchFresh({ recent, clock, attempts, deps }) {
    const skip = new Set((recent || []).map((id) => String(id)));
    const rollAnime = deps.randomAnime || defaultRandomAnime;
    const fetchShots = deps.fetchScreenshots || fetchScreenshots;
    let deferred = null;
    let sawUnavailable = false;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        let result = null;
        try {
            result = await rollAnime();
        } catch (error) {
            sawUnavailable = true;
            break;
        }
        if (!result || (result.ok === false && result.unavailable)) {
            sawUnavailable = true;
            break;
        }
        const media = result && result.media;
        if (!media || media.isAdult === true) continue;
        const id = animeKey(media.id);
        const mal = malKey(media.idMal);
        if (!id || !mal) continue;
        if (skip.has(id)) {
            if (!deferred) deferred = { media, mal };
            continue;
        }
        let shots = null;
        try {
            shots = await fetchShots(mal);
        } catch (error) {
            return { down: true };
        }
        if (!shots || shots.down) return { down: true };
        if (!shots.ok || !Array.isArray(shots.urls) || !shots.urls.length) continue;
        const doc = await store.saveAnime(media, shots.urls, clock());
        if (doc) return { doc };
    }
    if (deferred) {
        let shots = null;
        try {
            shots = await fetchShots(deferred.mal);
        } catch (error) {
            return { down: true };
        }
        if (!shots || shots.down) return { down: true };
        if (shots.ok && Array.isArray(shots.urls) && shots.urls.length) {
            const doc = await store.saveAnime(deferred.media, shots.urls, clock());
            if (doc) return { doc };
        }
    }
    return { unavailable: sawUnavailable };
}

async function serveCached({ guildKey, recent, random, clock, deps }) {
    const ids = await store.listIds();
    const pool = excludeRecent(ids, recent);
    if (!pool.length) return null;
    const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    const docId = pool[Math.floor(roll * pool.length)];
    let doc = await store.loadAnime(docId);
    if (!doc) return null;
    if (store.isStale(doc.fetchedAt, clock())) {
        const refreshed = await refreshAnime(doc, deps, clock);
        if (refreshed) doc = refreshed;
    }
    return store.takeScreenshot(guildKey, doc, random);
}

async function chooseRound(guildId, deps = {}) {
    const guildKey = snowflake(guildId);
    if (!guildKey) return { ok: false, empty: true };
    const random = typeof deps.random === 'function' ? deps.random : Math.random;
    const clock = typeof deps.now === 'function' ? deps.now : () => Date.now();
    const attempts = Number.isInteger(deps.attempts) && deps.attempts > 0 ? deps.attempts : GUESS_ATTEMPTS;
    const count = await store.countAnime();
    const guild = await store.loadGuild(guildKey);
    const fresh = count < GUESS_CACHE_TARGET || random() < GUESS_FRESH_CHANCE;
    if (fresh) {
        const created = await fetchFresh({
            recent: guild.recentIds,
            clock,
            attempts,
            deps,
        });
        if (created.down && !count) return { ok: false, down: true };
        if (created.doc) {
            const picked = await store.takeScreenshot(guildKey, created.doc, random);
            if (picked) return { ok: true, source: 'fresh', ...picked };
        }
        if (count === 0) {
            return created.unavailable
                ? { ok: false, unavailable: true }
                : { ok: false, empty: true };
        }
    }
    const served = await serveCached({
        guildKey,
        recent: guild.recentIds,
        random,
        clock,
        deps,
    });
    if (served) return { ok: true, source: 'cache', ...served };
    // The pool was missing or unreadable. Fetch live instead of failing the round.
    if (!fresh) {
        const created = await fetchFresh({
            recent: guild.recentIds,
            clock,
            attempts,
            deps,
        });
        if (created.down) return { ok: false, down: true };
        if (created.doc) {
            const picked = await store.takeScreenshot(guildKey, created.doc, random);
            if (picked) return { ok: true, source: 'fresh', ...picked };
        }
        return created.unavailable
            ? { ok: false, unavailable: true }
            : { ok: false, empty: true };
    }
    return { ok: false, empty: true };
}

module.exports = {
    chooseRound,
    fetchFresh,
    refreshAnime,
};
