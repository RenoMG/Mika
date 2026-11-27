// What Anime Releases can follow. Most entries are views of AniList's airing
// schedule (one shared request, filtered per entry); LiveChart.me is its own
// RSS feed. `matches(item)` decides whether an airing belongs to an entry.
//
// `defaultOn` entries are followed until a server changes its list.

// Shows this many AniList users track are "popular". About a dozen a season.
const POPULAR_MIN_USERS = 20000;

const SOURCES = [
    {
        id: 'premieres',
        name: 'New series premieres',
        emoji: '🆕',
        color: 0x3DB4F2,
        home: 'https://anilist.co/search/anime/this-season',
        description: 'Episode 1 of every new show and movie (AniList)',
        load: 'anilist',
        defaultOn: true,
        matches: (item) => item.episode === 1,
    },
    {
        id: 'popular',
        name: 'Popular shows',
        emoji: '🔥',
        color: 0xF25C54,
        home: 'https://anilist.co/search/anime/popular',
        description: `Every episode of shows ${POPULAR_MIN_USERS / 1000}k+ AniList users track`,
        load: 'anilist',
        defaultOn: true,
        matches: (item) => item.popularity >= POPULAR_MIN_USERS,
    },
    {
        id: 'finales',
        name: 'Season finales',
        emoji: '🏁',
        color: 0x9256F3,
        home: 'https://anilist.co/search/anime/this-season',
        description: 'The last episode of every show (AniList)',
        load: 'anilist',
        defaultOn: false,
        matches: (item) => Number.isInteger(item.episodes) && item.episodes > 1 && item.episode === item.episodes,
    },
    {
        id: 'all',
        name: 'Every new episode',
        emoji: '📺',
        color: 0x02A9FF,
        home: 'https://anilist.co/airing',
        description: 'All of AniList\'s airing schedule (30+ a day in season)',
        load: 'anilist',
        defaultOn: false,
        matches: () => true,
    },
    {
        id: 'livechart',
        name: 'LiveChart.me episodes',
        emoji: '📅',
        color: 0x4C8DFF,
        home: 'https://www.livechart.me/schedule',
        description: 'LiveChart.me\'s feed of episodes from the past day',
        feed: 'https://www.livechart.me/feeds/episodes',
        defaultOn: false,
        matches: () => true,
    },
];

const SOURCE_IDS = SOURCES.map((source) => source.id);
const DEFAULT_SOURCE_IDS = SOURCES.filter((source) => source.defaultOn).map((source) => source.id);

function sourceOf(id) {
    return SOURCES.find((source) => source.id === id) || null;
}

// Entries that read the same data share one fetch and one set of item IDs.
function loadKey(source) {
    return source.load || source.id;
}

module.exports = {
    POPULAR_MIN_USERS,
    SOURCES,
    SOURCE_IDS,
    DEFAULT_SOURCE_IDS,
    sourceOf,
    loadKey,
};
