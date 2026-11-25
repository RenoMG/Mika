const { containsSlur, neutralize } = require('./text');

// Per-entry details shared by every list: progress, score, notes, dates and the
// show facts stats need. Every value is checked here, whether it came from a
// slash option, an AniList import, or an older stored row. Anything that does
// not fit its type and range is dropped instead of being stored.

const NOTES_MAX = 300;
const EPISODES_MAX = 5000;
const REWATCH_MAX = 999;
const DURATION_MAX = 600;
const GENRES_MAX = 6;
const FORMATS = new Set(['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC']);
const FORMAT_LABELS = Object.freeze({
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music',
});
const DETAIL_KEYS = ['progress', 'episodes', 'score', 'notes', 'startedAt', 'completedAt', 'rewatches',
    'duration', 'format', 'genres', 'year', 'updatedAt'];

function wholeNumber(value, min, max) {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(number) || !Number.isInteger(number)) return null;
    if (number < min || number > max) return null;
    return number;
}

// Scores use AniList's 10-point decimal scale: 0.1 to 10, one decimal place.
// 0 means unscored and is stored as missing.
function cleanScore(value) {
    if (value == null || value === '' || typeof value === 'boolean') return null;
    const number = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(number) || number <= 0 || number > 10) return null;
    const rounded = Math.round(number * 10) / 10;
    return rounded > 0 ? rounded : null;
}

const DATE_MIN = Date.UTC(1950, 0, 1);
const DATE_SLACK_MS = 2 * 24 * 60 * 60 * 1000;

function cleanDate(value, now = Date.now()) {
    let at = null;
    if (value instanceof Date) at = value;
    else if (typeof value === 'string' || typeof value === 'number') at = new Date(value);
    if (!at || Number.isNaN(at.getTime())) return null;
    const ms = at.getTime();
    if (ms < DATE_MIN || ms > now + DATE_SLACK_MS) return null;
    return new Date(ms);
}

// AniList's FuzzyDate { year, month, day }. A missing month or day uses 1.
function fuzzyDate(value, now = Date.now()) {
    if (!value || typeof value !== 'object') return null;
    const year = wholeNumber(value.year, 1950, 2100);
    if (!year) return null;
    const month = wholeNumber(value.month, 1, 12) || 1;
    const day = wholeNumber(value.day, 1, 31) || 1;
    const at = new Date(Date.UTC(year, month - 1, day));
    if (at.getUTCMonth() !== month - 1) return null;
    return cleanDate(at, now);
}

// A typed date from a slash option: YYYY-MM-DD, YYYY-MM, or YYYY.
function parseDateText(value, now = Date.now()) {
    if (typeof value !== 'string') return null;
    const match = /^\s*(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?\s*$/.exec(value);
    if (!match) return null;
    return fuzzyDate({ year: Number(match[1]), month: match[2] ? Number(match[2]) : null, day: match[3] ? Number(match[3]) : null }, now);
}

// Notes are user text. Mentions, links, markdown and line breaks are removed,
// and a note that trips the slur filter is not kept at all.
function cleanNotes(value) {
    if (typeof value !== 'string') return '';
    const text = neutralize(value.normalize('NFKC').replace(/\u0000/g, ''), NOTES_MAX);
    if (!text || containsSlur(text)) return '';
    return text;
}

function cleanFormat(value) {
    const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
    return FORMATS.has(text) ? text : '';
}

function cleanGenres(list) {
    const next = [];
    for (const name of Array.isArray(list) ? list : []) {
        const text = neutralize(name, 40);
        if (!text || next.includes(text)) continue;
        next.push(text);
        if (next.length >= GENRES_MAX) break;
    }
    return next;
}

// Only valid keys are copied. A row is never given a key it did not have, so
// older rows stay as small as they were.
function cleanDetails(source, now = Date.now()) {
    const out = {};
    if (!source || typeof source !== 'object') return out;
    const episodes = wholeNumber(source.episodes, 1, EPISODES_MAX);
    if (episodes) out.episodes = episodes;
    let progress = wholeNumber(source.progress, 0, EPISODES_MAX);
    if (progress != null && episodes && progress > episodes) progress = episodes;
    if (progress) out.progress = progress;
    const score = cleanScore(source.score);
    if (score) out.score = score;
    const notes = cleanNotes(source.notes);
    if (notes) out.notes = notes;
    const started = cleanDate(source.startedAt, now);
    if (started) out.startedAt = started;
    const completed = cleanDate(source.completedAt, now);
    if (completed) out.completedAt = completed;
    const rewatches = wholeNumber(source.rewatches, 0, REWATCH_MAX);
    if (rewatches) out.rewatches = rewatches;
    const duration = wholeNumber(source.duration, 1, DURATION_MAX);
    if (duration) out.duration = duration;
    const format = cleanFormat(source.format);
    if (format) out.format = format;
    const genres = cleanGenres(source.genres);
    if (genres.length) out.genres = genres;
    const year = wholeNumber(source.year, 1900, 2100);
    if (year) out.year = year;
    const updated = cleanDate(source.updatedAt, now);
    if (updated) out.updatedAt = updated;
    return out;
}

// Facts about the show itself, read from a search or detail result.
function mediaFacts(media) {
    if (!media || typeof media !== 'object') return {};
    return cleanDetails({
        episodes: media.episodes,
        duration: media.duration,
        format: media.format,
        genres: media.genres,
        year: media.year || (media.startDate && media.startDate.year),
    });
}

function scoreText(score) {
    const value = cleanScore(score);
    if (!value) return '';
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function progressText(item) {
    const progress = wholeNumber(item && item.progress, 0, EPISODES_MAX) || 0;
    const episodes = wholeNumber(item && item.episodes, 1, EPISODES_MAX);
    if (!progress && !episodes) return '';
    return episodes ? `${progress}/${episodes}` : `ep ${progress}`;
}

function formatLabel(value) {
    return FORMAT_LABELS[cleanFormat(value)] || '';
}

module.exports = {
    NOTES_MAX,
    EPISODES_MAX,
    REWATCH_MAX,
    DETAIL_KEYS,
    FORMAT_LABELS,
    wholeNumber,
    cleanScore,
    cleanDate,
    fuzzyDate,
    parseDateText,
    cleanNotes,
    cleanFormat,
    cleanGenres,
    cleanDetails,
    mediaFacts,
    scoreText,
    progressText,
    formatLabel,
};
