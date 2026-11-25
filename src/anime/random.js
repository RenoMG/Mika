const { CURATED_TAGS } = require('./client');
const { BLOCKED, containsSlur, neutralize } = require('./text');

const ANILIST_GENRES = [
    'Action',
    'Adventure',
    'Comedy',
    'Drama',
    'Ecchi',
    'Fantasy',
    'Horror',
    'Mahou Shoujo',
    'Mecha',
    'Music',
    'Mystery',
    'Psychological',
    'Romance',
    'Sci-Fi',
    'Slice of Life',
    'Sports',
    'Supernatural',
    'Thriller',
];

const RANDOM_EMPTY = 'Nothing decent matched that. Try again, or pick fewer genres and tags.';
const RANDOM_DOWN = "AniList is unavailable right now. Try again in a minute.";
const GENRE_CHOICE = 'Pick a genre from the list.';
const TAG_CHOICE = 'Pick a tag from the list.';

function cleanTaste(list, limit = 10) {
    const next = [];
    const seen = new Set();
    for (const name of list || []) {
        const text = neutralize(name, 100);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key) || key === 'hentai') continue;
        seen.add(key);
        next.push(text);
        if (next.length >= limit) break;
    }
    return next;
}

function matchChoice(input, names) {
    const text = neutralize(input, 100).toLowerCase();
    if (!text) return null;
    return (names || []).find((name) => String(name).toLowerCase() === text) || null;
}

function filterChoices(names, text) {
    const query = String(text || '').trim().toLowerCase();
    const choices = [];
    for (const name of names || []) {
        if (typeof name !== 'string' || !name) continue;
        if (query && !name.toLowerCase().includes(query)) continue;
        choices.push({ name: name.slice(0, 100), value: name.slice(0, 100) });
        if (choices.length >= 25) break;
    }
    return choices;
}

// A picked genre or tag limits the roll. With neither, the roll is fully random.
function resolveRandomFilters({ genre, tag, genres, tags } = {}) {
    const allowedGenres = Array.isArray(genres) && genres.length ? genres : ANILIST_GENRES;
    const allowedTags = Array.isArray(tags) && tags.length ? tags : CURATED_TAGS;
    const pickedGenre = typeof genre === 'string' ? genre.trim() : '';
    const pickedTag = typeof tag === 'string' ? tag.trim() : '';
    if (pickedGenre || pickedTag) {
        const genresOut = [];
        const tagsOut = [];
        if (pickedGenre) {
            if (containsSlur(pickedGenre)) return { error: BLOCKED };
            const match = matchChoice(pickedGenre, allowedGenres);
            if (!match) return { error: GENRE_CHOICE };
            genresOut.push(match);
        }
        if (pickedTag) {
            if (containsSlur(pickedTag)) return { error: BLOCKED };
            const match = matchChoice(pickedTag, allowedTags);
            if (!match) return { error: TAG_CHOICE };
            tagsOut.push(match);
        }
        return { genres: genresOut, tags: tagsOut, source: 'choice' };
    }
    return { genres: [], tags: [], source: 'any' };
}

module.exports = {
    ANILIST_GENRES,
    RANDOM_EMPTY,
    RANDOM_DOWN,
    GENRE_CHOICE,
    TAG_CHOICE,
    cleanTaste,
    matchChoice,
    filterChoices,
    resolveRandomFilters,
};
