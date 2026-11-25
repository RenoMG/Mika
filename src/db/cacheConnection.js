const mongoose = require('mongoose');
const { redact } = require('../utils/redact');

// Second cluster for anime caches only. The default mongoose connection stays
// on MIKADATABASE. This database name is fixed so a URI that points at the
// same host as the main database still cannot read or write those collections.
const CACHE_DB_NAME = 'mika-cache';
const SERVER_SELECTION_MS = 2000;

let connection = null;
let starting = false;

function cacheUri() {
    const raw = process.env.MONGO_CACHE_URI;
    if (typeof raw !== 'string') return '';
    return raw.trim();
}

function ready() {
    return Boolean(connection && connection.readyState === 1);
}

function getConnection() {
    return connection;
}

function startCacheConnection() {
    if (starting || connection) return connection;
    starting = true;
    const uri = cacheUri();
    if (!uri) {
        starting = false;
        console.log('Cache database is not configured. Anime lookups will use live AniList and Kitsu.');
        return null;
    }
    if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) {
        starting = false;
        console.error('Cache database URI is not a MongoDB URI. Anime lookups will use live AniList and Kitsu.');
        return null;
    }

    let conn;
    try {
        conn = mongoose.createConnection(uri, {
            dbName: CACHE_DB_NAME,
            // Fail the call instead of queueing it while the cluster is down or waking up.
            bufferCommands: false,
            serverSelectionTimeoutMS: SERVER_SELECTION_MS,
            connectTimeoutMS: SERVER_SELECTION_MS,
            maxPoolSize: 5,
        });
    } catch (error) {
        starting = false;
        console.error('Cache database error.', redact(error));
        return null;
    }

    connection = conn;
    // on('error') also swallows the initial connection promise (mongoose does
    // this on purpose). Startup does not await asPromise().
    conn.on('error', (error) => {
        console.error('Cache database error.', redact(error));
    });
    conn.on('disconnected', () => {
        console.log('Disconnected from cache database.');
    });
    conn.on('reconnected', () => {
        console.log('Reconnected to cache database.');
    });
    conn.on('connected', () => {
        console.log('Connected to cache database.');
        const { ensureCacheIndexes } = require('./cacheIndexes');
        const { startEvictionTimer } = require('./evict');
        startEvictionTimer();
        const current = conn;
        ensureCacheIndexes().catch((error) => {
            if (getConnection() !== current) return;
            console.error('Cache indexes were not created.', redact(error));
        });
    });
    return conn;
}

async function closeCacheConnection() {
    const { stopEvictionTimer } = require('./evict');
    stopEvictionTimer();
    const conn = connection;
    connection = null;
    starting = false;
    if (!conn) return;
    conn.removeAllListeners();
    try {
        await conn.close();
    } catch (error) {
        // Closing a refused connection is cleanup. It must not surface.
    }
}

module.exports = {
    CACHE_DB_NAME,
    SERVER_SELECTION_MS,
    cacheUri,
    ready,
    getConnection,
    startCacheConnection,
    closeCacheConnection,
};
