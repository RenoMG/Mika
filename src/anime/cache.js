const crypto = require('node:crypto');
const { calculateObjectSize } = require('mongoose').mongo.BSON;
const { ready } = require('../db/cacheConnection');
const { noteWrite } = require('../db/evict');

// Public metadata has a bounded local copy. Local expiry never exceeds the
// persisted expiry; separate processes may retain a copy briefly after eviction.
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 15 * 60 * 1000;
const CACHE_OP_MS = 200;

// Shikimori screenshot URL lists still use this process-local map. A miss
// refetches Shikimori. The anime a guess round uses is the Mongo GuessAnime
// document, so this map does not choose a different show on another shard.
function createCache({ max = 200, ttlMs = 86400000, now = Date.now } = {}) {
    const entries = new Map();

    function get(key) {
        const hit = entries.get(key);
        if (!hit) return undefined;
        if (hit.expires <= now()) {
            entries.delete(key);
            return undefined;
        }
        entries.delete(key);
        entries.set(key, hit);
        return hit.value;
    }

    function set(key, value, lifetime = ttlMs) {
        if (entries.has(key)) entries.delete(key);
        entries.set(key, { value, expires: now() + Math.min(ttlMs, Math.max(0, lifetime)) });
        while (entries.size > max) {
            const oldest = entries.keys().next().value;
            entries.delete(oldest);
        }
        return value;
    }

    return {
        get,
        set,
        keys: () => [...entries.keys()].filter((key) => get(key) !== undefined),
        delete: (key) => entries.delete(key),
        clear: () => entries.clear(),
        get size() {
            return entries.size;
        },
        max,
        ttlMs,
    };
}

function cacheModel() {
    return require('../Models/AnimeCache').get();
}

function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            const error = new Error('Anime cache timed out');
            error.code = 'CACHE_TIMEOUT';
            reject(error);
        }, ms);
        if (typeof timer.unref === 'function') timer.unref();
        // Both resolution and rejection are handled below.
        // eslint-disable-next-line promise/catch-or-return
        Promise.resolve(promise).then(
            (value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function forget(promise) {
    Promise.resolve(promise).catch(() => {});
}

// Search keys are a hash of the normalized text. The stored key is hex, so a
// typed query can never become a regex or a Mongo operator.
function storageKey(kind, logicalKey) {
    const text = typeof logicalKey === 'string' ? logicalKey : String(logicalKey == null ? '' : logicalKey);
    if (!text || text.length > 500) return '';
    if (kind === 'detail') {
        if (!/^(?:\d{1,10}|kitsu:\d{1,10})$/.test(text)) return '';
        return `detail:${text}`;
    }
    if (kind === 'genre') {
        if (text !== 'all' && text !== 'tags') return '';
        return `genre:${text}`;
    }
    if (kind !== 'search') return '';
    const digest = crypto.createHash('sha256').update(`search\0${text}`).digest('hex');
    return `search:${digest}`;
}

function connected(model) {
    if (model) return true;
    return ready();
}

function createMongoCache({
    kind,
    ttlMs,
    timeoutMs = CACHE_OP_MS,
    now = Date.now,
    model = null,
} = {}) {
    const local = createCache({ max: kind === 'detail' ? 1000 : 300, ttlMs: Math.min(ttlMs, 60000), now });

    function Model() {
        return model || cacheModel();
    }

    function usable() {
        return connected(model) && Model();
    }

    async function get(logicalKey) {
        const key = storageKey(kind, logicalKey);
        if (!key) return undefined;
        const hit = local.get(key);
        if (hit !== undefined) return hit;
        if (!usable()) return undefined;
        try {
            const doc = await withTimeout(
                Model().findOne({ key }).maxTimeMS(timeoutMs).lean(),
                timeoutMs,
            );
            if (!doc || doc.expireAt == null) return undefined;
            const expires = new Date(doc.expireAt).getTime();
            if (!Number.isFinite(expires) || expires <= now()) return undefined;
            local.set(key, doc.value, expires - now());
            if (doc._id && now() - new Date(doc.lastAccessedAt || 0).getTime() >= 60000) {
                forget(Model().updateOne(
                    { _id: doc._id },
                    { $set: { lastAccessedAt: new Date(now()) } },
                ).maxTimeMS(timeoutMs));
            }
            return doc.value;
        } catch (error) {
            return undefined;
        }
    }

    async function set(logicalKey, value) {
        const key = storageKey(kind, logicalKey);
        if (!key || value == null) return value;
        if (kind === 'search' && calculateObjectSize({ value }) > 64 * 1024) return value;
        local.set(key, value);
        if (!usable()) return value;
        const expireAt = new Date(now() + ttlMs);
        const lastAccessedAt = new Date(now());
        const write = () => Model().updateOne(
            { key },
            { $set: { key, kind, value, expireAt, lastAccessedAt } },
            { upsert: true },
        ).maxTimeMS(timeoutMs);
        let saved = false;
        try {
            await withTimeout(write(), timeoutMs);
            saved = true;
        } catch (error) {
            if (error && error.code === 11000) {
                try {
                    await withTimeout(
                        Model().updateOne(
                            { key },
                            { $set: { kind, value, expireAt, lastAccessedAt } },
                        ).maxTimeMS(timeoutMs),
                        timeoutMs,
                    );
                    saved = true;
                } catch (retryError) {
                    // The live response is already in hand. Cache loss is a miss next time.
                }
            }
        }
        if (saved) noteWrite(kind);
        return value;
    }

    return { get, set, kind, ttlMs };
}

const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });

function publicDetail(media) {
    const { relatedTitles, guessContextVersion, ...detail } = media;
    return detail;
}

async function rememberDetail(media) {
    const id = media && (media.id || media.anilistId);
    if (id == null || typeof id === 'object') return;
    try {
        await details.set(String(id), publicDetail(media));
    } catch (error) {
        // GuessAnime is already written. This copy is only a shortcut.
    }
}

async function readGuessDetail(anilistId) {
    const id = typeof anilistId === 'string' ? anilistId : String(anilistId == null ? '' : anilistId);
    if (!/^\d{1,10}$/.test(id) || !ready()) return null;
    try {
        const GuessAnime = require('../Models/GuessAnime').get();
        if (!GuessAnime) return null;
        const doc = await withTimeout(
            GuessAnime.findOne({ anilistId: id }).maxTimeMS(CACHE_OP_MS).lean(),
            CACHE_OP_MS,
        );
        if (!doc || !doc.media || typeof doc.media !== 'object' || !doc.fetchedAt) return null;
        const fetched = new Date(doc.fetchedAt).getTime();
        if (!Number.isFinite(fetched) || Date.now() - fetched >= DETAIL_TTL_MS) return null;
        if (doc._id && Date.now() - new Date(doc.lastAccessedAt || 0).getTime() >= 60000) {
            forget(GuessAnime.updateOne(
                { _id: doc._id },
                { $set: { lastAccessedAt: new Date() } },
            ).maxTimeMS(CACHE_OP_MS));
        }
        return publicDetail(doc.media);
    } catch (error) {
        return null;
    }
}

module.exports = {
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    CACHE_OP_MS,
    createCache,
    createMongoCache,
    storageKey,
    rememberDetail,
    readGuessDetail,
    withTimeout,
};
