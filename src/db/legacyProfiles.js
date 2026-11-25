// Collections from the removed stored-profile features (Mika's own lists,
// recommendations, follows, and the list import). Profiles now link to
// AniList or MyAnimeList and keep nothing else.
const LEGACY_COLLECTIONS = Object.freeze([
    'animeprofiles',
    'pendingrecommendations',
    'recommendguards',
    'fulllistnotices',
    'animefollows',
    'anilistlinks',
]);

// Counts what would go. Drops only with apply: true.
async function dropLegacyProfiles(db, { apply = false } = {}) {
    const present = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((row) => row.name));
    const found = [];
    for (const name of LEGACY_COLLECTIONS) {
        if (!present.has(name)) continue;
        found.push({ name, documents: await db.collection(name).estimatedDocumentCount() });
    }
    if (apply) {
        for (const row of found) await db.collection(row.name).drop();
    }
    return { dryRun: !apply, collections: found };
}

module.exports = { LEGACY_COLLECTIONS, dropLegacyProfiles };
