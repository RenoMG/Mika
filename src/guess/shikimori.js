const { createCache } = require('../anime/cache');
const { createLimiter } = require('../anime/client');
const {
    SHIKIMORI_MAX_PER_MINUTE,
    SHIKIMORI_MIN_INTERVAL_MS,
    SHIKIMORI_TIMEOUT_MS,
    SHIKIMORI_USER_AGENT,
} = require('./constants');

function malKey(value) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0 || number > 100000000) return null;
    return number;
}

function screenshotUrl(value) {
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw || raw.length > 500 || raw.includes('\\') || raw.includes('..')) return null;
    let url;
    try {
        if (raw.startsWith('https://shikimori.io/')) url = new URL(raw);
        else if (raw.startsWith('/') && !raw.startsWith('//')) url = new URL(`https://shikimori.io${raw}`);
        else return null;
    } catch (error) {
        return null;
    }
    if (url.protocol !== 'https:' || url.hostname !== 'shikimori.io') return null;
    if (url.username || url.password || url.pathname.includes('..')) return null;
    return url.toString();
}

function parseScreenshots(body) {
    if (!Array.isArray(body)) return { ok: false, down: true };
    const urls = [];
    const seen = new Set();
    for (const entry of body) {
        const raw = entry && typeof entry === 'object' ? (entry.original || entry.preview) : entry;
        const url = screenshotUrl(raw);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        urls.push(url);
        if (urls.length >= 40) break;
    }
    return { ok: true, urls };
}

function createShotLimiter(options = {}) {
    return createLimiter({
        minIntervalMs: SHIKIMORI_MIN_INTERVAL_MS,
        maxPerWindow: SHIKIMORI_MAX_PER_MINUTE,
        windowMs: 60 * 1000,
        ...options,
    });
}

const sharedLimiter = createShotLimiter();
const sharedCache = createCache({ max: 400, ttlMs: 24 * 60 * 60 * 1000 });

async function request(fetchImpl, url, timeoutMs) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        return await fetchImpl(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': SHIKIMORI_USER_AGENT,
            },
            redirect: 'follow',
            signal: controller ? controller.signal : undefined,
        });
    } catch (error) {
        const failed = new Error('Shikimori request failed');
        failed.code = error && (error.name === 'AbortError' || error.code === 'ABORT_ERR') ? 'TIMEOUT' : 'NETWORK';
        throw failed;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

async function fetchScreenshots(idMal, options = {}) {
    const id = malKey(idMal);
    if (!id) return { ok: false, reason: 'mal' };
    const cache = options.cache || sharedCache;
    const limiter = options.limiter || sharedLimiter;
    const fetchImpl = options.fetch || global.fetch;
    const key = String(id);
    if (!options.fresh) {
        const hit = cache.get(key);
        if (Array.isArray(hit)) return { ok: true, urls: hit.slice(), cached: true };
    }
    const url = `https://shikimori.io/api/animes/${key}/screenshots`;
    let response;
    try {
        response = await limiter.schedule(() => request(fetchImpl, url, options.timeoutMs || SHIKIMORI_TIMEOUT_MS));
    } catch (error) {
        return { ok: false, down: true };
    }
    if (!response || typeof response.status !== 'number') return { ok: false, down: true };
    if (response.status === 404) return { ok: true, urls: [] };
    if (response.status !== 200) return { ok: false, down: true };
    let body;
    try {
        body = await response.json();
    } catch (error) {
        return { ok: false, down: true };
    }
    const parsed = parseScreenshots(body);
    if (!parsed.ok) return parsed;
    if (parsed.urls.length) cache.set(key, parsed.urls.slice());
    return { ok: true, urls: parsed.urls };
}

module.exports = {
    malKey,
    screenshotUrl,
    parseScreenshots,
    createShotLimiter,
    fetchScreenshots,
    sharedLimiter,
    sharedCache,
};
