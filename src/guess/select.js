const { getGuessCandidates, getAnime, getGuessContext } = require('../anime/client');
const { withTimeout, createCache } = require('../anime/cache');
const { snowflake } = require('../utils/safeId');
const {
    GUESS_ATTEMPTS, GUESS_CACHE_TARGET, GUESS_FRESH_CHANCE, GUESS_RECENT_LIMIT,
    GUESS_PLAYER_RECENT_LIMIT, GUESS_BATCH_ATTEMPTS, GUESS_BATCH_ADDITIONS,
} = require('./constants');
const { animeKey } = require('./policy');
const { ids, cleanHistory, familyIndex, selectFamily, rememberFamily } = require('./families');
const { fetchScreenshots, malKey } = require('./shikimori');
const store = require('./store');
const { maintenance } = require('./maintenance');

// A small shuffled page is shared across refill passes; candidates are still
// checked against persisted inventory before any screenshot request.
let candidates = [];
async function defaultRandomAnime() {
    if (!candidates.length) {
        const result = await getGuessCandidates();
        if (!result.ok) return result;
        candidates = result.media.slice();
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
    }
    return { ok: true, media: candidates.pop() };
}

async function defaultGetAnime(id) {
    try {
        const media = await getAnime(id, { fresh: true });
        return media ? { ...media, ...await getGuessContext(id) } : null;
    } catch {
        return null;
    }
}

async function refreshAnime(doc, deps, clock) {
    try {
        const media = await (deps.getAnime || defaultGetAnime)(doc.anilistId, { fresh: true });
        if (!media || media.isAdult === true || !malKey(media.idMal)) return null;
        const shots = await (deps.fetchScreenshots || fetchScreenshots)(media.idMal, { fresh: true });
        if (!shots?.ok || shots.down || !shots.urls?.length) return null;
        return await store.saveAnime({ ...media,
            relatedIds: ids([...(doc.media.relatedIds || []), ...(media.relatedIds || [])]),
        }, shots.urls, clock());
    } catch {
        return null;
    }
}

async function fetchFresh({ recent = [], clock = Date.now, attempts = GUESS_ATTEMPTS, deps = {}, distinct = false }) {
    const rows = await store.listPool();
    const skip = new Set([...recent, ...rows.map((row) => row.anilistId)].map(String));
    const rollAnime = deps.randomAnime || defaultRandomAnime;
    const fetchShots = deps.fetchScreenshots || fetchScreenshots;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        let result;
        try { result = await rollAnime(); }
        catch { return { unavailable: true }; }
        if (!result || result.unavailable) return { unavailable: true };
        const media = result.media;
        if (!media || media.isAdult === true || media.status === 'NOT_YET_RELEASED') continue;
        const id = animeKey(media.id);
        const mal = malKey(media.idMal);
        if (!id || !mal || skip.has(id)) continue;
        skip.add(id);
        if (distinct) {
            const index = familyIndex(rows, [{ animeId: id, relatedIds: media.relatedIds }]);
            const family = index.groups.get(index.root(id));
            if (family) {
                // A skipped sequel can connect a later movie to an existing
                // franchise. Retain those links without fetching its images.
                const representative = await store.loadAnime(family[0].anilistId);
                if (representative) {
                    const previous = representative.media.relatedIds || [];
                    const relatedIds = ids([...previous, id, ...(media.relatedIds || [])]);
                    if (relatedIds.some((key) => !previous.includes(key))) {
                        await store.saveAnime({ ...representative.media, relatedIds }, representative.screenshots,
                            new Date(representative.fetchedAt).getTime());
                    }
                }
                continue;
            }
        }
        let shots;
        try { shots = await fetchShots(mal); }
        catch { return { down: true }; }
        if (!shots || shots.down) return { down: true };
        if (!shots.ok || !shots.urls?.length) continue;
        const doc = await store.saveAnime(media, shots.urls, clock());
        if (doc) return { doc };
    }
    return { empty: true };
}

// Metadata upgrades and stale refreshes share a budget with growth, rather than
// taking the only maintenance slot and starving new franchises indefinitely.
const contextBackoff = createCache({ max: 400, ttlMs: 5 * 60000 });
async function replenish(deps = {}) {
    const clock = deps.now || Date.now;
    const rows = await store.listPool();
    const deadline = clock() + 20000;
    const families = familyIndex(rows.filter((row) => row.guessContextVersion === 2)).groups.size;
    const target = families < GUESS_CACHE_TARGET ? GUESS_BATCH_ADDITIONS : (deps.grow ? 1 : 0);
    const docs = [];
    let last = {};
    const attempts = Math.min(GUESS_BATCH_ATTEMPTS, deps.attempts || GUESS_BATCH_ATTEMPTS);
    for (let attempt = 0; attempt < attempts && docs.length < target && clock() < deadline; attempt++) {
        last = await fetchFresh({ clock, attempts: 1, deps, distinct: true });
        if (last.doc) docs.push(last.doc);
        if (last.down || last.unavailable) break;
    }
    // Growth gets first use of the budget. Failed legacy metadata cannot keep
    // a small pool trapped on the same titles; retry other entries on later ticks.
    const old = rows.filter((row) => row.guessContextVersion !== 2 && !contextBackoff.get(row.anilistId)).slice(0, 2);
    for (const row of old) {
        if (clock() >= deadline) break;
        const doc = await store.loadAnime(row.anilistId);
        if (!doc) continue;
        const context = await Promise.resolve().then(() => (deps.getContext || getGuessContext)(row.anilistId)).catch(() => null);
        if (context?.guessContextVersion === 2) {
            await store.saveAnime({ ...doc.media, ...context,
                relatedIds: ids([...(doc.media.relatedIds || []), ...(context.relatedIds || [])]),
            }, doc.screenshots, new Date(doc.fetchedAt).getTime());
        } else contextBackoff.set(row.anilistId, true);
    }
    const stale = rows.find((row) => store.isStale(row.fetchedAt, clock()));
    if (stale && clock() < deadline) {
        const doc = await store.loadAnime(stale.anilistId);
        if (doc) await refreshAnime(doc, deps, clock);
    }
    return { ...last, doc: docs[0], docs };
}

async function reserveCached(guildKey, userId, random) {
    return store.withGuildSelection(guildKey, async () => {
        let [rows, guild, playerHistory] = await Promise.all([
            store.listPool(), store.loadGuild(guildKey), store.loadPlayerHistory(userId, guildKey),
        ]);
        // Legacy servers retain their exact-title history while relationship
        // metadata is upgraded in the background. No destructive migration.
        const guildHistory = guild.recentFranchises?.length ? guild.recentFranchises
            : cleanHistory(guild.recentIds.map((animeId) => ({ animeId })));
        for (let retry = 0; retry < GUESS_ATTEMPTS; retry++) {
            const selected = selectFamily(rows, guildHistory, playerHistory, random);
            if (!selected) return null;
            const doc = await store.loadAnime(selected.row.anilistId);
            if (doc?.screenshots?.length) {
                return store.reserveScreenshot(guildKey, doc, random, {
                    guild, userId,
                    guildHistory: rememberFamily(guildHistory, selected.entry, rows, GUESS_RECENT_LIMIT),
                    playerHistory: rememberFamily(playerHistory, selected.entry, rows, GUESS_PLAYER_RECENT_LIMIT),
                });
            }
            rows = rows.filter((row) => row.anilistId !== selected.row.anilistId);
        }
        return null;
    });
}

async function chooseRound(guildId, deps = {}) {
    const guildKey = snowflake(guildId);
    if (!guildKey) return { ok: false, empty: true };
    const userId = snowflake(deps.userId) || '';
    const random = typeof deps.random === 'function' ? deps.random : Math.random;
    const upkeep = deps.maintenance || maintenance;
    const served = await reserveCached(guildKey, userId, random);
    const rows = await store.listPool();
    const families = familyIndex(rows.filter((row) => row.guessContextVersion === 2)).groups.size;
    const needsWork = families < GUESS_CACHE_TARGET || rows.some((row) => store.isStale(row.fetchedAt, (deps.now || Date.now)()))
        || rows.some((row) => row.guessContextVersion !== 2);
    if (served) {
        if (needsWork || random() < GUESS_FRESH_CHANCE) upkeep.request(() => replenish({ ...deps, grow: true }));
        return { ok: true, source: 'cache', ...served };
    }
    const job = upkeep.request(() => replenish({ ...deps, grow: true }));
    // Automatic drops never wait for provider work. Personal cold starts have a
    // short deadline; the shared job keeps running and no play is lost.
    if (deps.cacheOnly) return { ok: false, empty: true, variety: true };
    const created = job ? await withTimeout(job, 2500).catch(() => null) : null;
    const picked = await reserveCached(guildKey, userId, random);
    if (picked) return { ok: true, source: 'fresh', ...picked };
    return { ok: false, down: Boolean(created?.down), unavailable: Boolean(created?.unavailable), empty: true, variety: !(created?.down || created?.unavailable) };
}

function startPoolWarmup({ setTimer = setInterval, clearTimer = clearInterval, ...deps } = {}) {
    let stopped = false;
    const upkeep = deps.maintenance || maintenance;
    const tick = () => { if (!stopped) upkeep.request(() => replenish(deps)); };
    tick();
    const timer = setTimer(tick, 60000);
    timer?.unref?.();
    return () => { stopped = true; clearTimer(timer); };
}

module.exports = { chooseRound, fetchFresh, refreshAnime, replenish, startPoolWarmup };
