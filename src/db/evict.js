const { redact } = require('../utils/redact');
const { ready } = require('./cacheConnection');

// 440MB of the 512MB Atlas quota. The rest is indexes and storage overhead.
// Planning sizes are above measured BSON (detail ~1.6KB typical / ~2.5KB at the
// synopsis cap, search ~300B, guess ~2.7KB with 12 screenshots / ~4.6KB at 40).
const BUDGET_BYTES = 440 * 1024 * 1024;
const ESTIMATED_BYTES = {
    detail: 2048,
    search: 512,
    genre: 512,
    guessAnime: 4096,
};
const DEFAULT_CAPS = {
    detail: 100_000,
    search: 40_000,
    genre: 8,
    guessAnime: 12_000,
};
const KINDS = Object.keys(DEFAULT_CAPS);
const TRIM_BATCH = 500;
const TRIM_EVERY = 25;
const TRIM_INTERVAL_MS = 60_000;

const caps = { ...DEFAULT_CAPS };
let trimEvery = TRIM_EVERY;
const writes = new Map();
const tails = new Map();
let timer = null;

function budgetBytes() {
    let total = 0;
    for (const kind of KINDS) total += caps[kind] * ESTIMATED_BYTES[kind];
    return total;
}

function collectionCap(name) {
    if (name === 'guessanimes') return caps.guessAnime;
    if (name === 'animecaches') return caps.detail + caps.search + caps.genre;
    return 0;
}

function setCacheCaps(next) {
    if (!next || typeof next !== 'object') return;
    for (const kind of KINDS) {
        const value = next[kind];
        if (Number.isInteger(value) && value > 0) caps[kind] = value;
    }
}

function resetCacheCaps() {
    for (const kind of KINDS) caps[kind] = DEFAULT_CAPS[kind];
    trimEvery = TRIM_EVERY;
    writes.clear();
}

function setTrimEvery(value) {
    const next = Math.floor(Number(value));
    if (Number.isInteger(next) && next > 0) trimEvery = next;
}

function target(kind) {
    if (kind === 'guessAnime') {
        const model = require('../Models/GuessAnime').get();
        return { model, filter: {} };
    }
    const model = require('../Models/AnimeCache').get();
    return { model, filter: { kind } };
}

async function trimKind(kind) {
    if (!ready() || !DEFAULT_CAPS[kind]) return;
    const cap = caps[kind];
    const { model, filter } = target(kind);
    if (!model || !Number.isInteger(cap) || cap < 1) return;
    const count = await model.countDocuments(filter);
    if (count <= cap) return;
    const excess = Math.min(count - cap, TRIM_BATCH);
    const stale = await model.find(filter)
        .sort({ lastAccessedAt: 1, _id: 1 })
        .limit(excess)
        .select('_id')
        .lean();
    if (!stale.length) return;
    await model.deleteMany({ _id: { $in: stale.map((doc) => doc._id) } });
    if (count - stale.length > cap) await trimKind(kind);
}

function scheduleTrim(kind) {
    const previous = tails.get(kind) || Promise.resolve();
    const next = previous.then(() => trimKind(kind)).catch((error) => {
        console.error('Cache eviction failed.', redact(error));
    });
    tails.set(kind, next);
    return next;
}

function noteWrite(kind) {
    if (!DEFAULT_CAPS[kind]) return null;
    const count = (writes.get(kind) || 0) + 1;
    if (count < trimEvery) {
        writes.set(kind, count);
        return null;
    }
    writes.set(kind, 0);
    return scheduleTrim(kind);
}

function settleEviction() {
    return Promise.all([...tails.values()].map((job) => Promise.resolve(job).catch(() => {})));
}

async function evictNow() {
    await settleEviction();
    for (const kind of KINDS) {
        try {
            await trimKind(kind);
        } catch (error) {
            console.error('Cache eviction failed.', redact(error));
        }
    }
}

function startEvictionTimer() {
    if (timer) return;
    timer = setInterval(() => {
        evictNow().catch((error) => {
            console.error('Cache eviction failed.', redact(error));
        });
    }, TRIM_INTERVAL_MS);
    if (typeof timer.unref === 'function') timer.unref();
}

function stopEvictionTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}

module.exports = {
    BUDGET_BYTES,
    ESTIMATED_BYTES,
    DEFAULT_CAPS,
    TRIM_EVERY,
    TRIM_INTERVAL_MS,
    budgetBytes,
    collectionCap,
    setCacheCaps,
    resetCacheCaps,
    setTrimEvery,
    noteWrite,
    scheduleTrim,
    settleEviction,
    evictNow,
    startEvictionTimer,
    stopEvictionTimer,
};
