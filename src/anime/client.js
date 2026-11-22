const { redact } = require('../utils/redact');
const { createCache } = require('./cache');
const { normalizeTitle } = require('./match');
const { mediaId } = require('./ids');

const ANILIST_URL = 'https://graphql.anilist.co';
const KITSU_ORIGIN = 'https://kitsu.app/api/edge/anime';
const DETAIL_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 15 * 60 * 1000;
const DETAIL_MAX = 200;
const SEARCH_MAX = 40;
const SKIP_MS = 1500;
const MIN_INTERVAL_MS = 2500;
const MAX_PER_WINDOW = 24;
const WINDOW_MS = 60 * 1000;

const MEDIA_FIELDS = `
  id
  isAdult
  siteUrl
  description
  episodes
  status
  averageScore
  genres
  synonyms
  title { romaji english native }
  tags { name rank isGeneralSpoiler isMediaSpoiler isAdult }
  studios { nodes { name isAnimationStudio } }
  startDate { year month day }
  endDate { year month day }
  coverImage { large }
`;

const SEARCH_QUERY = `query ($search: String) {
  Page(page: 1, perPage: 10) {
    media(search: $search, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      ${MEDIA_FIELDS}
    }
  }
}`;

const MEDIA_QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME, isAdult: false) {
    ${MEDIA_FIELDS}
  }
}`;

const GENRE_QUERY = 'query { GenreCollection }';

function delayMs({ now, stamps, pauseUntil, minIntervalMs, maxPerWindow, windowMs }) {
    const recent = [];
    for (const stamp of stamps) {
        if (now - stamp < windowMs) recent.push(stamp);
    }
    let wait = 0;
    if (pauseUntil > now) wait = Math.max(wait, pauseUntil - now);
    if (recent.length >= maxPerWindow) wait = Math.max(wait, windowMs - (now - recent[0]) + 1);
    if (recent.length) wait = Math.max(wait, minIntervalMs - (now - recent[recent.length - 1]));
    return wait;
}

function createLimiter({
    maxPerWindow = MAX_PER_WINDOW,
    windowMs = WINDOW_MS,
    minIntervalMs = MIN_INTERVAL_MS,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
    const stamps = [];
    let pauseUntil = 0;
    let tail = Promise.resolve();

    function waitMs() {
        return delayMs({
            now: now(),
            stamps,
            pauseUntil,
            minIntervalMs,
            maxPerWindow,
            windowMs,
        });
    }

    function noteRetryAfter(ms) {
        const delay = Math.min(Math.max(0, Number(ms) || 0), 120000);
        pauseUntil = Math.max(pauseUntil, now() + delay);
    }

    function schedule(run) {
        const job = tail.then(async () => {
            let wait = waitMs();
            while (wait > 0) {
                await sleep(wait);
                wait = waitMs();
            }
            stamps.push(now());
            return run();
        });
        tail = job.then(() => {}, () => {});
        return job;
    }

    return { waitMs, noteRetryAfter, schedule };
}

function httpUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '';
}

function plainSynopsis(value) {
    let text = String(value || '');
    text = text.replace(/~![\s\S]*?!~/g, '');
    text = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '');
    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>');
    text = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length > 1200) text = `${text.slice(0, 1199).trimEnd()}…`;
    return text;
}

function dateFrom(value) {
    if (!value || typeof value !== 'object' || !value.year) return null;
    return {
        year: Number(value.year) || null,
        month: Number(value.month) || null,
        day: Number(value.day) || null,
    };
}

function tagsFrom(tags) {
    if (!Array.isArray(tags)) return [];
    return tags
        .filter((tag) => tag && typeof tag.name === 'string' && !tag.isGeneralSpoiler && !tag.isMediaSpoiler && tag.isAdult !== true)
        .sort((a, b) => (b.rank || 0) - (a.rank || 0))
        .slice(0, 5)
        .map((tag) => tag.name);
}

function studiosFrom(studios) {
    const nodes = studios && Array.isArray(studios.nodes) ? studios.nodes : [];
    const animation = nodes.filter((node) => node && node.isAnimationStudio && node.name);
    const chosen = animation.length ? animation : nodes.filter((node) => node && node.name);
    return chosen.slice(0, 4).map((node) => String(node.name));
}

function fromAnilist(media) {
    if (!media || typeof media !== 'object' || media.isAdult === true || !media.id) return null;
    const titles = media.title || {};
    return {
        id: String(media.id),
        source: 'AniList',
        url: httpUrl(media.siteUrl) || `https://anilist.co/anime/${media.id}`,
        cover: httpUrl(media.coverImage && media.coverImage.large),
        titles: {
            romaji: typeof titles.romaji === 'string' ? titles.romaji : '',
            english: typeof titles.english === 'string' ? titles.english : '',
            native: typeof titles.native === 'string' ? titles.native : '',
        },
        synonyms: Array.isArray(media.synonyms) ? media.synonyms.filter((name) => typeof name === 'string').slice(0, 12) : [],
        synopsis: plainSynopsis(media.description),
        episodes: Number.isInteger(media.episodes) ? media.episodes : null,
        status: typeof media.status === 'string' ? media.status : '',
        score: Number.isInteger(media.averageScore) ? media.averageScore : null,
        genres: Array.isArray(media.genres) ? media.genres.filter((name) => typeof name === 'string').slice(0, 12) : [],
        tags: tagsFrom(media.tags),
        studios: studiosFrom(media.studios),
        startDate: dateFrom(media.startDate),
        endDate: dateFrom(media.endDate),
    };
}

function dateFromIso(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function kitsuSafe(attributes) {
    if (!attributes || attributes.nsfw === true) return false;
    const rating = String(attributes.ageRating || '').toUpperCase();
    return rating !== 'R18' && rating !== 'R18+';
}

function kitsuGenres(item, included) {
    const refs = item && item.relationships && item.relationships.categories && item.relationships.categories.data;
    if (!Array.isArray(refs)) return [];
    const byId = new Map();
    for (const row of included || []) {
        if (row && row.type === 'categories' && row.id != null) byId.set(String(row.id), row);
    }
    const names = [];
    for (const ref of refs) {
        const row = byId.get(String(ref && ref.id));
        const attributes = row && row.attributes;
        if (!attributes || attributes.nsfw === true) continue;
        const title = attributes.title || attributes.name;
        if (typeof title === 'string' && title) names.push(title);
    }
    return names.slice(0, 12);
}

function fromKitsu(item, included) {
    if (!item || item.id == null) return null;
    const attributes = item.attributes || {};
    if (!kitsuSafe(attributes)) return null;
    const titles = attributes.titles || {};
    const poster = attributes.posterImage || {};
    const score = Number(attributes.averageRating);
    return {
        id: `kitsu:${item.id}`,
        source: 'Kitsu',
        url: `https://kitsu.app/anime/${attributes.slug || item.id}`,
        cover: httpUrl(poster.large || poster.medium || poster.original),
        titles: {
            romaji: typeof titles.en_jp === 'string' ? titles.en_jp : '',
            english: typeof titles.en === 'string' ? titles.en : (typeof attributes.canonicalTitle === 'string' ? attributes.canonicalTitle : ''),
            native: typeof titles.ja_jp === 'string' ? titles.ja_jp : '',
        },
        synonyms: Array.isArray(attributes.abbreviatedTitles) ? attributes.abbreviatedTitles.filter((name) => typeof name === 'string').slice(0, 12) : [],
        synopsis: plainSynopsis(attributes.synopsis),
        episodes: Number.isInteger(attributes.episodeCount) ? attributes.episodeCount : null,
        status: typeof attributes.status === 'string' ? attributes.status : '',
        score: Number.isFinite(score) ? Math.round(score) : null,
        genres: kitsuGenres(item, included),
        tags: [],
        studios: [],
        startDate: dateFromIso(attributes.startDate),
        endDate: dateFromIso(attributes.endDate),
    };
}

function parseKitsuList(body) {
    const rows = body && Array.isArray(body.data) ? body.data : [];
    const included = body && Array.isArray(body.included) ? body.included : [];
    return rows.map((item) => fromKitsu(item, included)).filter(Boolean).slice(0, 10);
}

function retryAfterMs(response, now) {
    const raw = response && response.headers && typeof response.headers.get === 'function'
        ? response.headers.get('retry-after')
        : null;
    if (raw == null || raw === '') return 60000;
    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds) * 1000, 120000);
    const when = Date.parse(String(raw));
    if (Number.isFinite(when)) return Math.min(Math.max(0, when - now), 120000);
    return 60000;
}

function createClient({
    fetch: fetchImpl = global.fetch,
    now = Date.now,
    sleep,
    limiter,
    detailCache,
    searchCache,
    genreCache,
} = {}) {
    const limit = limiter || createLimiter({ now, sleep });
    const details = detailCache || createCache({ max: DETAIL_MAX, ttlMs: DETAIL_TTL_MS, now });
    const searches = searchCache || createCache({ max: SEARCH_MAX, ttlMs: SEARCH_TTL_MS, now });
    const genres = genreCache || createCache({ max: 2, ttlMs: DETAIL_TTL_MS, now });

    function remember(list) {
        for (const media of list) details.set(media.id, media);
        return list;
    }

    async function callAnilist(query, variables) {
        if (limit.waitMs() >= SKIP_MS) return null;
        let response;
        try {
            response = await limit.schedule(() => fetchImpl(ANILIST_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'User-Agent': 'Mika Discord Bot',
                },
                body: JSON.stringify({ query, variables }),
                signal: AbortSignal.timeout(8000),
            }));
        } catch (error) {
            console.error(redact(error));
            return null;
        }
        if (!response) return null;
        if (response.status === 429) {
            limit.noteRetryAfter(retryAfterMs(response, now()));
            return null;
        }
        if (response.status !== 200) return null;
        try {
            return await response.json();
        } catch (error) {
            console.error(redact(error));
            return null;
        }
    }

    async function kitsuFetch(url) {
        try {
            const response = await fetchImpl(url, {
                headers: {
                    Accept: 'application/vnd.api+json',
                    'User-Agent': 'Mika Discord Bot',
                },
                signal: AbortSignal.timeout(8000),
            });
            if (!response || response.status !== 200) return null;
            return await response.json();
        } catch (error) {
            console.error(redact(error));
            return null;
        }
    }

    async function searchAnilist(text) {
        const body = await callAnilist(SEARCH_QUERY, { search: text });
        if (!body || !body.data) return null;
        const media = body.data.Page && Array.isArray(body.data.Page.media) ? body.data.Page.media : [];
        return media.map(fromAnilist).filter(Boolean).slice(0, 10);
    }

    async function searchKitsu(text) {
        const url = new URL(KITSU_ORIGIN);
        url.searchParams.set('filter[text]', text.slice(0, 100));
        url.searchParams.set('filter[nsfw]', 'false');
        url.searchParams.set('page[limit]', '10');
        url.searchParams.set('include', 'categories');
        const body = await kitsuFetch(url.toString());
        if (!body) return null;
        return parseKitsuList(body);
    }

    async function search(text) {
        const query = typeof text === 'string' ? text.trim() : '';
        const key = normalizeTitle(query);
        if (!key) return [];
        const cached = searches.get(key);
        if (cached) return cached;
        let list = await searchAnilist(query);
        if (!list) list = await searchKitsu(query);
        if (!list) return [];
        remember(list);
        searches.set(key, list);
        return list;
    }

    async function getAnime(id) {
        const key = mediaId(id);
        if (!key) return null;
        const cached = details.get(key);
        if (cached) return cached;
        if (key.startsWith('kitsu:')) {
            const body = await kitsuFetch(`${KITSU_ORIGIN}/${key.slice(6)}?include=categories`);
            const media = body && body.data ? fromKitsu(body.data, body.included) : null;
            if (media) details.set(key, media);
            return media;
        }
        const body = await callAnilist(MEDIA_QUERY, { id: Number(key) });
        if (!body || !body.data) return null;
        const media = fromAnilist(body.data.Media);
        if (media) details.set(key, media);
        return media;
    }

    async function getGenres() {
        const cached = genres.get('all');
        if (cached) return cached;
        const body = await callAnilist(GENRE_QUERY, {});
        let list = null;
        if (body && body.data && Array.isArray(body.data.GenreCollection)) {
            list = body.data.GenreCollection.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim());
        }
        if (!list) return [];
        const unique = [...new Set(list)].sort((a, b) => a.localeCompare(b));
        genres.set('all', unique);
        return unique;
    }

    return { search, getAnime, getGenres, details, searches };
}

const shared = createClient();

module.exports = {
    ANILIST_URL,
    SEARCH_QUERY,
    MEDIA_QUERY,
    GENRE_QUERY,
    DETAIL_TTL_MS,
    SEARCH_TTL_MS,
    DETAIL_MAX,
    SEARCH_MAX,
    MIN_INTERVAL_MS,
    MAX_PER_WINDOW,
    delayMs,
    createLimiter,
    createClient,
    fromAnilist,
    plainSynopsis,
    searchAnime: (text) => shared.search(text),
    getAnime: (id) => shared.getAnime(id),
    getGenres: () => shared.getGenres(),
};
