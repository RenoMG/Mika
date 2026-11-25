// Genre and era packs narrow a personal round to part of the pool. Era packs
// use the start year; genre packs use AniList genres. `scope` is the AniList
// candidate filter used to grow a pack that runs low.
const ERA = (from, to) => ({ test: (row) => Number.isInteger(row.year) && row.year >= from && row.year <= to,
    scope: { after: from * 10000 - 1, before: (to + 1) * 10000 } });
const GENRE = (name) => ({ test: (row) => (row.genres || []).includes(name), scope: { genre: name } });

const PACKS = Object.freeze({
    'era-classic': { name: 'Classics (before 1990)', emoji: '📼', ...ERA(1900, 1989) },
    'era-90s': { name: '1990s', emoji: '💿', ...ERA(1990, 1999) },
    'era-00s': { name: '2000s', emoji: '📀', ...ERA(2000, 2009) },
    'era-10s': { name: '2010s', emoji: '📱', ...ERA(2010, 2019) },
    'era-20s': { name: '2020s', emoji: '🛰️', ...ERA(2020, 2099) },
    action: { name: 'Action', emoji: '💥', ...GENRE('Action') },
    adventure: { name: 'Adventure', emoji: '🧭', ...GENRE('Adventure') },
    comedy: { name: 'Comedy', emoji: '😂', ...GENRE('Comedy') },
    drama: { name: 'Drama', emoji: '🎭', ...GENRE('Drama') },
    fantasy: { name: 'Fantasy', emoji: '🐉', ...GENRE('Fantasy') },
    horror: { name: 'Horror', emoji: '👻', ...GENRE('Horror') },
    mecha: { name: 'Mecha', emoji: '🤖', ...GENRE('Mecha') },
    music: { name: 'Music', emoji: '🎵', ...GENRE('Music') },
    mystery: { name: 'Mystery', emoji: '🔍', ...GENRE('Mystery') },
    psychological: { name: 'Psychological', emoji: '🌀', ...GENRE('Psychological') },
    romance: { name: 'Romance', emoji: '💕', ...GENRE('Romance') },
    'sci-fi': { name: 'Sci-Fi', emoji: '🚀', ...GENRE('Sci-Fi') },
    'slice-of-life': { name: 'Slice of Life', emoji: '🍵', ...GENRE('Slice of Life') },
    sports: { name: 'Sports', emoji: '🏀', ...GENRE('Sports') },
    supernatural: { name: 'Supernatural', emoji: '🔮', ...GENRE('Supernatural') },
    thriller: { name: 'Thriller', emoji: '🔪', ...GENRE('Thriller') },
});

function packOf(id) {
    return typeof id === 'string' && Object.hasOwn(PACKS, id) ? { id, ...PACKS[id] } : null;
}

function packChoices() {
    return Object.entries(PACKS).map(([value, pack]) => ({ name: pack.name, value }));
}

module.exports = { PACKS, packOf, packChoices };
