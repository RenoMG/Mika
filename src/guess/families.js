const { animeKey } = require('./policy');

function ids(values) {
    return [...new Set((values || []).map(animeKey).filter(Boolean))].slice(0, 100);
}

function historyEntry(row) {
    const animeId = animeKey(row?.animeId || row?.anilistId);
    return animeId ? { animeId, relatedIds: ids(row.relatedIds) } : null;
}

function cleanHistory(rows, limit = 50) {
    return (rows || []).map(historyEntry).filter(Boolean).slice(0, limit);
}

// Use provider relationships, not title prefixes. Historical IDs participate in
// the graph so a cache eviction or a newly discovered season cannot reset history.
function familyIndex(rows, history = []) {
    const parents = new Map();
    function root(id) {
        if (!parents.has(id)) parents.set(id, id);
        let key = id;
        while (parents.get(key) !== key) key = parents.get(key);
        while (parents.get(id) !== id) {
            const next = parents.get(id);
            parents.set(id, key);
            id = next;
        }
        return key;
    }
    for (const row of [...rows, ...history]) {
        const entry = historyEntry(row);
        if (!entry) continue;
        for (const id of [entry.animeId, ...entry.relatedIds]) {
            const left = root(entry.animeId);
            const right = root(id);
            if (left !== right) parents.set(right, left);
        }
    }
    const groups = new Map();
    for (const row of rows) {
        const id = animeKey(row.anilistId);
        if (!id) continue;
        const key = root(id);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    return { root, groups };
}

function pick(list, random) {
    const roll = Math.min(0.999999, Math.max(0, Number(random()) || 0));
    return list[Math.floor(roll * list.length)];
}

function selectFamily(rows, guildHistory = [], playerHistory = [], random = Math.random) {
    const index = familyIndex(rows, [...guildHistory, ...playerHistory]);
    const recent = [...new Set(guildHistory.map((entry) => index.root(entry.animeId)))];
    const blocked = new Set(playerHistory.map((entry) => index.root(entry.animeId)));
    // Also prevent consecutive server repeats, including automatic rounds and
    // tiny pools. If nothing is eligible the caller warms the pool/refunds.
    if (recent.length) blocked.add(recent[0]);
    const eligible = [...index.groups.keys()].filter((key) => !blocked.has(key));
    let open = eligible.filter((key) => !recent.includes(key));
    if (!open.length) {
        // Relax only the oldest available server entry, never personal history.
        const oldest = [...recent].reverse().find((key) => eligible.includes(key));
        open = oldest ? [oldest] : [];
    }
    if (!open.length) return null;
    const family = index.groups.get(pick(open, random));
    // A singleton does not need another draw (also keeps seeded runs stable).
    const row = family.length === 1 ? family[0] : pick(family, random);
    const relatedIds = ids(family.flatMap((item) => [item.anilistId, ...(item.relatedIds || [])]));
    return { row, entry: { animeId: row.anilistId, relatedIds } };
}

function rememberFamily(history, entry, rows, limit) {
    const index = familyIndex(rows, [...history, entry]);
    const seen = new Set();
    return [entry, ...history].filter((item) => {
        const key = index.root(item.animeId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

module.exports = { ids, cleanHistory, familyIndex, selectFamily, rememberFamily };
