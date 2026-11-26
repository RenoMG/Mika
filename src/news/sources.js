// The anime news sites Anime News can follow. Each one has an RSS feed, and a
// `isNews` check that keeps only news: several of these sites publish reviews,
// interviews, features, and quizzes in the same feed, and only items tagged or
// filed as news get through. A new site is one entry here.
//
// `defaultOn` sites are followed until a server changes its list, so a server
// that just switches Anime News on gets a steady stream, not every site at once.

function pathOf(link) {
    try {
        return new URL(link).pathname.toLowerCase();
    } catch (error) {
        return '';
    }
}

function hasCategory(item, pattern) {
    return (item.categories || []).some((category) => pattern.test(String(category).trim()));
}

// A category such as "Manga Reviews" or "Interview" means the item is not news.
const NOT_NEWS = /\b(reviews?|interviews?|features?|columns?|editorials?|opinions?|quiz(zes)?|guides?|lists?|rankings?|podcasts?)\b/i;

const SOURCES = [
    {
        id: 'crunchyroll',
        name: 'Crunchyroll News',
        emoji: '🍥',
        color: 0xF47521,
        home: 'https://www.crunchyroll.com/news',
        feed: 'https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss',
        defaultOn: true,
        // Every story is filed under /news/<kind>/. Only "latest" is news; the
        // others are features, interviews, and quizzes.
        isNews: (item) => pathOf(item.link).startsWith('/news/latest/'),
    },
    {
        id: 'ann',
        name: 'Anime News Network',
        emoji: '📡',
        color: 0x2D5A9C,
        home: 'https://www.animenewsnetwork.com/news/',
        feed: 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=w',
        defaultOn: true,
        // News lives under /news/ and /interest/; reviews, columns, and features have their own paths.
        isNews: (item) => /^\/(news|interest)\//.test(pathOf(item.link)) && !hasCategory(item, NOT_NEWS),
    },
    {
        id: 'mal',
        name: 'MyAnimeList News',
        emoji: '📘',
        color: 0x2E51A2,
        home: 'https://myanimelist.net/news',
        // A news-only feed: every item is a news post.
        feed: 'https://myanimelist.net/rss/news.xml',
        defaultOn: false,
        isNews: (item) => pathOf(item.link).startsWith('/news/'),
    },
    {
        id: 'animecorner',
        name: 'Anime Corner',
        emoji: '📐',
        color: 0xE94B6A,
        home: 'https://animecorner.me/category/news/',
        feed: 'https://animecorner.me/feed/',
        defaultOn: false,
        isNews: (item) => hasCategory(item, /^(anime |manga )?news$/i) && !hasCategory(item, NOT_NEWS),
    },
    {
        id: 'anitrendz',
        name: 'Anime Trending',
        emoji: '📈',
        color: 0x00A8E1,
        home: 'https://anitrendz.net/news',
        feed: 'https://anitrendz.net/news/feed/',
        defaultOn: false,
        isNews: (item) => hasCategory(item, /^news$/i) && !hasCategory(item, NOT_NEWS),
    },
];

const SOURCE_IDS = SOURCES.map((source) => source.id);
const DEFAULT_SOURCE_IDS = SOURCES.filter((source) => source.defaultOn).map((source) => source.id);

function sourceOf(id) {
    return SOURCES.find((source) => source.id === id) || null;
}

// Tracking tags make links long and differ between copies of the same story.
function cleanLink(link) {
    try {
        const url = new URL(link);
        for (const key of [...url.searchParams.keys()]) {
            if (/^utm_/i.test(key) || key === '_location') url.searchParams.delete(key);
        }
        return url.href;
    } catch (error) {
        return link;
    }
}

module.exports = {
    SOURCES,
    SOURCE_IDS,
    DEFAULT_SOURCE_IDS,
    NOT_NEWS,
    sourceOf,
    cleanLink,
};
