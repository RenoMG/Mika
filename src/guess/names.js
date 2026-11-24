const { createCache } = require('../anime/cache');
const { GUESS_PAGE_SIZE } = require('./constants');
const caches = new WeakMap();
function cacheFor(client) {
    if (!caches.has(client)) caches.set(client, { names: createCache({ max: 1000, ttlMs: 300000 }), jobs: new Map() });
    return caches.get(client);
}
async function resolveName(client, id) {
    const { names, jobs } = cacheFor(client);
    const existing = client.users?.cache?.get(id) || names.get(id);
    if (existing) return existing;
    if (jobs.has(id)) return jobs.get(id);
    if (jobs.size >= 30) return null;
    const job = (async () => {
        try {
            const user = await client.users?.fetch?.(id);
            const value = user ? { username: user.username, bot: user.bot, system: user.system } : {};
            names.set(id, value, user ? 300000 : 30000);
            return value;
        } catch { names.set(id, {}, 30000); return null; }
    })().finally(() => jobs.delete(id));
    jobs.set(id, job);
    return job;
}
async function loadPageNames(client, entries, page) {
    let next = entries.map((entry) => ({ ...entry }));
    // If a legacy bot row is discovered, fill its place from the next row.
    for (;;) {
        const start = Math.min(Math.max(0, page), Math.max(0, Math.ceil(next.length / GUESS_PAGE_SIZE) - 1)) * GUESS_PAGE_SIZE;
        const waiting = next.slice(start, start + GUESS_PAGE_SIZE).filter((row) => !row.nameLoaded);
        if (!waiting.length) break;
        let cursor = 0;
        await Promise.all(Array.from({ length: Math.min(3, waiting.length) }, async () => {
            while (cursor < waiting.length) {
                const row = waiting[cursor++];
                const user = await resolveName(client, row.userID);
                row.username = user?.username || 'Unknown user';
                row.departed = !user?.username;
                row.isBot = user?.bot === true || user?.system === true;
                row.nameLoaded = true;
            }
        }));
        next = next.filter((row) => !row.isBot).map((row, index) => ({ ...row, position: index + 1 }));
    }
    return next;

}
module.exports = { loadPageNames };
