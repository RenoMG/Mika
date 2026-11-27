// Reads AniList's airing schedule: every episode that aired in Japan in a
// recent window, with the show's titles, pictures, studio, next episode, and
// streaming links. One request per pass, shared by every server. AniList
// allows 90 requests a minute; this makes one or two every 10 minutes.
const { readJson } = require('../utils/http');

const ANILIST_URL = 'https://graphql.anilist.co';
const FETCH_TIMEOUT_MS = 15000;
const PER_PAGE = 50;
const MAX_PAGES = 3;

const AIRING_QUERY = `query ($from: Int, $to: Int, $page: Int) {
  Page(page: $page, perPage: ${PER_PAGE}) {
    pageInfo { hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME_DESC) {
      id
      episode
      airingAt
      media {
        id
        isAdult
        format
        episodes
        popularity
        siteUrl
        genres
        title { romaji english native }
        coverImage { large color }
        bannerImage
        studios(isMain: true) { nodes { name } }
        nextAiringEpisode { episode airingAt }
        externalLinks { site url type isDisabled }
      }
    }
  }
}`;

function colorOf(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
    return match ? parseInt(match[1], 16) : null;
}

// One airing as a feed item. Adult shows are dropped here, so nothing else has to check.
function itemOf(schedule) {
    const media = schedule && schedule.media;
    if (!media || media.isAdult || (media.genres || []).includes('Hentai')) return null;
    const episode = Number(schedule.episode);
    const airingAt = Number(schedule.airingAt);
    if (!Number.isInteger(episode) || !Number.isFinite(airingAt)) return null;
    const title = media.title || {};
    const name = title.english || title.romaji || title.native || 'Anime';
    const next = media.nextAiringEpisode;
    return {
        id: String(schedule.id),
        mediaId: String(media.id),
        title: name,
        romaji: title.romaji || '',
        native: title.native || '',
        link: media.siteUrl || `https://anilist.co/anime/${media.id}`,
        published: new Date(airingAt * 1000),
        episode,
        episodes: Number.isInteger(media.episodes) ? media.episodes : null,
        format: media.format || '',
        popularity: Number(media.popularity) || 0,
        genres: (media.genres || []).slice(0, 4),
        studio: media.studios?.nodes?.[0]?.name || '',
        image: media.bannerImage || null,
        cover: media.coverImage?.large || null,
        color: colorOf(media.coverImage?.color),
        nextEpisode: next && Number.isFinite(Number(next.airingAt))
            ? { episode: Number(next.episode), at: new Date(Number(next.airingAt) * 1000) }
            : null,
        streams: (media.externalLinks || [])
            .filter((link) => link && link.type === 'STREAMING' && !link.isDisabled && link.url)
            .map((link) => ({ site: String(link.site || 'Stream'), url: String(link.url) })),
    };
}

// Every airing from `from` to `to` (seconds), newest first, as a feed.
async function fetchAiring({ from, to }, { fetchImpl = globalThis.fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    const items = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let body;
        try {
            const response = await fetchImpl(ANILIST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'Mika Discord bot (Anime Releases)' },
                body: JSON.stringify({ query: AIRING_QUERY, variables: { from, to, page } }),
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`AniList answered ${response.status}`);
            body = await readJson(response, controller.signal);
        } finally {
            clearTimeout(timer);
        }
        if (body && Array.isArray(body.errors) && body.errors.length) throw new Error(`AniList: ${body.errors[0].message || 'query failed'}`);
        const found = body?.data?.Page;
        if (!found || !Array.isArray(found.airingSchedules)) throw new Error('AniList sent an unexpected answer');
        for (const schedule of found.airingSchedules) {
            const item = itemOf(schedule);
            if (item) items.push(item);
        }
        if (!found.pageInfo?.hasNextPage) break;
    }
    return { title: 'AniList', link: 'https://anilist.co/', items };
}

module.exports = { ANILIST_URL, AIRING_QUERY, itemOf, fetchAiring };
