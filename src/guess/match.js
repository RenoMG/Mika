const { MIN_FUZZY_LENGTH } = require('./constants');

const { normalizeTitle: normalizeGuess } = require('../anime/match');

function levenshtein(left, right) {
    if (left === right) return 0;
    const a = String(left || '');
    const b = String(right || '');
    const diff = Math.abs(a.length - b.length);
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (diff > 2) return diff;
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let previous = i - 1;
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const saved = row[j];
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
            previous = saved;
        }
    }
    return row[b.length];
}

function titlesOf(media) {
    const titles = media && media.titles ? media.titles : {};
    return [titles.romaji, titles.english, titles.native, ...((media && media.synonyms) || [])];
}

function tinySubstring(left, right) {
    if (!left || !right || left === right) return false;
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    if (!longer.includes(shorter)) return false;
    if (shorter.length < MIN_FUZZY_LENGTH) return true;
    return shorter.length / longer.length < 0.75;
}

function guessMatches(guess, media) {
    const left = normalizeGuess(guess);
    if (!left || left.length > 120) return false;
    for (const name of titlesOf(media)) {
        const right = normalizeGuess(name);
        if (!right) continue;
        if (left === right) return true;
        if (left.length < MIN_FUZZY_LENGTH || right.length < MIN_FUZZY_LENGTH) continue;
        if (tinySubstring(left, right)) continue;
        if (Math.abs(left.length - right.length) > 2) continue;
        const limit = left.length < 8 ? 1 : 2;
        if (levenshtein(left, right) <= limit) return true;
    }
    return false;
}

module.exports = {
    normalizeGuess,
    levenshtein,
    guessMatches,
};
