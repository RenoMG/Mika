const crypto = require('node:crypto');
const mongoose = require('mongoose');

// Details stay for 24 hours. Search lists stay for 15 minutes. There is no
// entry cap: the TTL index on expireAt is the bound, and it is shared by
// every shard. Nothing is kept in this process in front of Mongo. A memory
// copy would let one shard serve a result another shard had already expired.
// Lookups are exact key matches with a short timeout. If Mongo is slow or
// down, the caller fetches AniList or Kitsu and the command still succeeds.
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

    function set(key, value) {
        if (entries.has(key)) entries.delete(key);
        entries.set(key, { value, expires: now() + ttlMs });
        while (entries.size > max) {
            const oldest = entries.keys().next().value;
            entries.delete(oldest);
        }
        return value;
    }

    return {
        get,
        set,
        get size() {
            return entries.size;
        },
        max,
        ttlMs,
    };
}

function cacheModel() {
    return require('../Models/AnimeCache');
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

function connected() {
    return mongoose.connection && mongoose.connection.readyState === 1;
}

function createMongoCache({
    kind,
    ttlMs,
    timeoutMs = CACHE_OP_MS,
    now = Date.now,
    model = null,
} = {}) {
    function Model() {
        return model || cacheModel();
    }

    async function get(logicalKey) {
        const key = storageKey(kind, logicalKey);
        if (!key || !connected()) return undefined;
        try {
            const doc = await withTimeout(
                Model().findOne({ key }).maxTimeMS(timeoutMs).lean(),
                timeoutMs,
            );
            if (!doc || doc.expireAt == null) return undefined;
            const expires = new Date(doc.expireAt).getTime();
            if (!Number.isFinite(expires) || expires <= now()) return undefined;
            return doc.value;
        } catch (error) {
            return undefined;
        }
    }

    async function set(logicalKey, value) {
        const key = storageKey(kind, logicalKey);
        if (!key || value == null || !connected()) return value;
        const expireAt = new Date(now() + ttlMs);
        const write = () => Model().updateOne(
            { key },
            { $set: { key, kind, value, expireAt } },
            { upsert: true },
        ).maxTimeMS(timeoutMs);
        try {
            await withTimeout(write(), timeoutMs);
        } catch (error) {
            if (error && error.code === 11000) {
                try {
                    await withTimeout(
                        Model().updateOne({ key }, { $set: { kind, value, expireAt } }).maxTimeMS(timeoutMs),
                        timeoutMs,
                    );
                } catch (retryError) {
                    // The live response is already in hand. Cache loss is a miss next time.
                }
            }
        }
        return value;
    }

    return { get, set, kind, ttlMs };
}

const details = createMongoCache({ kind: 'detail', ttlMs: DETAIL_TTL_MS });

async function rememberDetail(media) {
    const id = media && (media.id || media.anilistId);
    if (id == null || typeof id === 'object') return;
    try {
        await details.set(String(id), media);
    } catch (error) {
        // GuessAnime is already written. This copy is only a shortcut.
    }
}

async function readGuessDetail(anilistId) {
    const id = typeof anilistId === 'string' ? anilistId : String(anilistId == null ? '' : anilistId);
    if (!/^\d{1,10}$/.test(id) || !connected()) return null;
    try {
        const GuessAnime = require('../Models/GuessAnime');
        const doc = await withTimeout(
            GuessAnime.findOne({ anilistId: id }).maxTimeMS(CACHE_OP_MS).lean(),
            CACHE_OP_MS,
        );
        if (!doc || !doc.media || typeof doc.media !== 'object' || !doc.fetchedAt) return null;
        const fetched = new Date(doc.fetchedAt).getTime();
        if (!Number.isFinite(fetched) || Date.now() - fetched >= DETAIL_TTL_MS) return null;
        return doc.media;
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
};
