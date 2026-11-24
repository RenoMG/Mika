const { MIN_FUZZY_LENGTH } = require('./constants');
const { normalizeTitle: normalizeGuess, levenshtein } = require('../anime/match');

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const GENERIC = new Set(['the', 'a', 'an', 'of', 'and', 'no', 'movie', 'film', 'season', 'part', 'tv', 'special', 'ova', 'ona', 'anime']);
function normalized(value) {
    return normalizeGuess(value).replace(/\b(season|part|cour) i\b/g, '$1 1').replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
        .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/g, (word) => ROMAN[word])
        .replace(/\b(\d+) season\b/g, 'season $1');
}
function titlesOf(media) {
    return Object.values(media?.titles || {}).filter((title) => typeof title === 'string' && title.trim());
}
function numbers(value) { return (value.match(/\b\d+\b/g) || []).join(','); }
function fuzzy(left, right) {
    if (left.length < MIN_FUZZY_LENGTH || right.length < MIN_FUZZY_LENGTH) return false;
    // An installment number is part of the answer, never a spelling mistake.
    if (numbers(left) !== numbers(right) || Math.abs(left.length - right.length) > 2) return false;
    return levenshtein(left, right) <= (left.length < 8 ? 1 : 2);
}
function meaningful(value) {
    return value.split(' ').filter((word) => !GENERIC.has(word) && !/^\d+$/.test(word));
}
function partial(left, right) {
    if (left.length >= right.length) return false;
    const [shorter, longer] = [left, right];
    if (shorter.length < 5 || !(` ${longer} `).includes(` ${shorter} `)) return false;
    const words = meaningful(shorter);
    return words.length >= 2 || (words.length === 1 && words[0].length >= 5);
}
// Built once per round. Judging a message never contacts a provider or Mongo.
function createJudge(media) {
    const canonical = [...new Set(titlesOf(media).map(normalized).filter(Boolean))];
    const related = [...new Set((media?.relatedTitles || []).map(normalized).filter(Boolean))];
    const aliases = [...new Set((media?.synonyms || []).map(normalized).filter(Boolean))];
    const broadAliases = aliases.filter((alias) => related.includes(alias) || canonical.some((title) =>
        title.startsWith(`${alias} `) && (media?.format === 'MOVIE' || /\b(season|part) \d+\b/.test(title))));
    const names = [...new Set([...canonical, ...aliases.filter((alias) => !broadAliases.includes(alias))])];
    const hint = media?.format === 'MOVIE' ? 'movie' : 'specific';
    return function judge(guess) {
        const left = normalized(guess);
        if (!left || left.length > 120) return { kind: 'wrong' };
        if (canonical.includes(left)) return { kind: 'correct' };
        const entryHint = media?.format === 'MOVIE' ? 'movie' : 'entry';
        if (related.includes(left) || broadAliases.includes(left)) return { kind: 'close', hint: entryHint };
        if (names.includes(left)) return { kind: 'correct' };
        if ([...related, ...broadAliases].some((name) => fuzzy(left, name))) return { kind: 'close', hint: entryHint };
        if (names.some((name) => fuzzy(left, name))) return { kind: 'correct' };
        if (names.some((name) => partial(left, name))) return { kind: 'close', hint };
        if (left.length >= 8 && meaningful(left).length >= 2 && names.some((name) => {
            const prefix = name.split(' ').slice(0, left.split(' ').length).join(' ');
            return prefix.length < name.length && fuzzy(left, prefix);
        })) return { kind: 'close', hint };
        const withoutNumbers = (value) => value.replace(/\b\d+\b/g, '#');
        if (numbers(left) && names.some((name) => numbers(name)
            && withoutNumbers(left) === withoutNumbers(name))) return { kind: 'close', hint: 'entry' };
        return { kind: 'wrong' };
    };
}
function classifyGuess(guess, media) { return createJudge(media)(guess); }
function guessMatches(guess, media) { return classifyGuess(guess, media).kind === 'correct'; }
module.exports = { normalizeGuess, levenshtein, guessMatches, classifyGuess, createJudge };
