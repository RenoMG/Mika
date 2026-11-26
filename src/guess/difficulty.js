// Difficulty narrows a personal anime round by AniList popularity: how many
// users have the show on their list. Normal is the whole pool, as before.
// Easy is the big hits and pays less; Hard is the deep cuts and pays more.
// `scope` is the AniList candidate filter used to grow a tier that runs low.
// A title whose popularity is not known yet only appears on Normal.
const EASY_MIN = 200000; // Roughly the 300 most popular qualifying shows.
const HARD_MAX = 60000; // Outside roughly the 1,000 most popular.

const TIERS = Object.freeze({
    easy: {
        name: 'Easy', emoji: '🌱', crystals: 30,
        test: (row) => Number.isInteger(row.popularity) && row.popularity >= EASY_MIN,
        scope: { popAbove: EASY_MIN - 1 },
    },
    hard: {
        name: 'Hard', emoji: '🔥', crystals: 80,
        test: (row) => Number.isInteger(row.popularity) && row.popularity < HARD_MAX,
        scope: { popBelow: HARD_MAX },
    },
});

// Normal (or nothing) is no tier at all.
function tierOf(id) {
    return typeof id === 'string' && Object.hasOwn(TIERS, id) ? { id, ...TIERS[id] } : null;
}

function tierChoices() {
    return [
        { name: '🌱 Easy · popular hits · 30 crystals', value: 'easy' },
        { name: 'Normal · everything · 50 crystals', value: 'normal' },
        { name: '🔥 Hard · deep cuts · 80 crystals', value: 'hard' },
    ];
}

// One pool filter for a pack, a tier, or both. The id keys the shared growth
// job and candidate list, so Hard Mecha grows apart from plain Mecha.
function poolFilter(pack, tier) {
    if (!pack && !tier) return null;
    const tests = [pack, tier].filter(Boolean).map((part) => part.test);
    return {
        id: [pack?.id, tier && `d-${tier.id}`].filter(Boolean).join('+'),
        test: (row) => tests.every((test) => test(row)),
        scope: { ...pack?.scope, ...tier?.scope },
    };
}

module.exports = { TIERS, EASY_MIN, HARD_MAX, tierOf, tierChoices, poolFilter };
