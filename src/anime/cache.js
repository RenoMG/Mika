// Bounded in-memory cache. A Raspberry Pi already spends its disk and RAM on
// Mongo for profiles; a hard entry cap keeps this cache from growing, and a
// restart simply refetches. Cover art is never stored, only the CDN URL the
// caller already put on the value.

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

module.exports = { createCache };
