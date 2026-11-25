// Seasons are calendar quarters in Pacific time: Q1 is January to March.
const pacificParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric',
});

function parts(now) {
    const out = {};
    for (const part of pacificParts.formatToParts(now)) out[part.type] = Number(part.value);
    return out;
}

function seasonKey(now = Date.now()) {
    const { year, month } = parts(now);
    return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

// A Pacific calendar day, used for the daily gift cap.
function dayKey(now = Date.now()) {
    const { year, month, day } = parts(now);
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseSeason(key) {
    const match = /^(\d{4})-Q([1-4])$/.exec(String(key || ''));
    return match ? { year: Number(match[1]), quarter: Number(match[2]) } : null;
}

function seasonLabel(key) {
    const season = parseSeason(key);
    return season ? `Q${season.quarter} ${season.year}` : 'Season';
}

const LAST_DAY = ['Mar 31', 'Jun 30', 'Sep 30', 'Dec 31'];
function seasonEnds(key) {
    const season = parseSeason(key);
    return season ? `${LAST_DAY[season.quarter - 1]}, ${season.year}` : '';
}

const MEDALS = ['🥇', '🥈', '🥉'];
const PLACES = ['Champion', 'Runner-up', 'Third place'];

function titleText(title) {
    const rank = Number(title?.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > 3) return '';
    return `${MEDALS[rank - 1]} ${seasonLabel(title.season)} ${PLACES[rank - 1]}`;
}

// The badge beside a name: the best rank from the most recent titled season.
function latestTitle(titles) {
    const list = (Array.isArray(titles) ? titles : []).filter((title) => parseSeason(title?.season)
        && Number.isInteger(title.rank) && title.rank >= 1 && title.rank <= 3);
    if (!list.length) return null;
    return list.slice().sort((a, b) => b.season.localeCompare(a.season) || a.rank - b.rank)[0];
}

function titleBadge(titles) {
    const title = latestTitle(titles);
    return title ? MEDALS[title.rank - 1] : '';
}

module.exports = { seasonKey, dayKey, parseSeason, seasonLabel, seasonEnds, titleText, latestTitle, titleBadge, MEDALS };
