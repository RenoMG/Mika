const { readJson } = require('../../utils/http');
const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { embed: styledEmbed } = require('../../utils/style');
const { neutralize } = require('../../anime/text');
const { defer, finish } = require('../../utils/ack');
const { isQuietError } = require('../../utils/interactionErrors');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

const MEME_TIMEOUT_MS = 4000;
const MEME_ERROR = "Couldn't fetch an anime meme right now.";
const USER_AGENT = 'Mika Discord Bot/2.0 (anime memes)';
const UNSAFE_ATTEMPTS = 2;
const BATCH = 10;

// Primary is a batch from meme-api (r/animememes). Fallback is Reddit's public
// JSON for r/Animemes, a different subreddit and a different host. A batch that
// is only NSFW or spoilers is requested once more. A dead host is not retried.
const SOURCES = [
    {
        id: 'meme-api',
        subreddit: 'animememes',
        url: `https://meme-api.com/gimme/animememes/${BATCH}`,
        parse: parseMemeApi,
    },
    {
        id: 'reddit',
        subreddit: 'Animemes',
        url: 'https://www.reddit.com/r/Animemes/hot.json?limit=25&raw_json=1',
        parse: parseReddit,
    },
];

function isImageUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return false;
    let url;
    try {
        url = new URL(value);
    } catch (error) {
        return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return /\.(?:gif|jpe?g|png|webp)$/i.test(url.pathname);
}

function isRedditPost(value) {
    if (typeof value !== 'string' || value.length > 2048) return false;
    let url;
    try {
        url = new URL(value);
    } catch (error) {
        return false;
    }
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    return host === 'redd.it' || host === 'reddit.com' || host.endsWith('.reddit.com');
}

function isSafePost(post) {
    return Boolean(post)
        && post.nsfw === false
        && post.spoiler === false
        && post.stickied !== true
        && isImageUrl(post.url)
        && isRedditPost(post.postLink)
        && typeof post.title === 'string'
        && post.title.trim().length > 0;
}

function pickSafe(posts) {
    const safe = (Array.isArray(posts) ? posts : []).filter(isSafePost);
    if (safe.length === 0) return null;
    return safe[Math.floor(Math.random() * safe.length)];
}

function parseMemeApi(body) {
    const list = body && Array.isArray(body.memes) ? body.memes : [];
    return list.map((item) => ({
        title: item && item.title,
        url: item && item.url,
        postLink: item && item.postLink,
        author: item && item.author,
        subreddit: item && item.subreddit,
        nsfw: !item || item.nsfw !== false,
        spoiler: !item || item.spoiler !== false,
        stickied: false,
    }));
}

function parseReddit(body) {
    const children = body && body.data && Array.isArray(body.data.children) ? body.data.children : [];
    return children.map((child) => {
        const data = child && child.data ? child.data : {};
        const permalink = typeof data.permalink === 'string' ? data.permalink : '';
        return {
            title: data.title,
            url: data.url,
            postLink: permalink.startsWith('/') ? `https://www.reddit.com${permalink}` : '',
            author: data.author,
            subreddit: data.subreddit,
            nsfw: data.over_18 !== false || data.thumbnail === 'nsfw',
            spoiler: data.spoiler !== false,
            stickied: data.stickied === true || data.pinned === true || data.is_video === true,
        };
    });
}

function sanitizeTitle(value) {
    const clean = neutralize(value, 256);
    return clean || 'Anime meme';
}

function plainName(value, fallback) {
    // Footer text is not markdown, so underscores in a Reddit name stay.
    // Anything else (mentions, spaces, punctuation) is replaced with the fallback.
    let text = String(value == null ? '' : value).replace(/[\u0000\u200B-\u200D\uFEFF]/g, '');
    for (let pass = 0; pass < 4; pass += 1) {
        const next = text.replace(/@(everyone|here)/gi, '');
        if (next === text) break;
        text = next;
    }
    text = text
        .replace(/<@!?\d{17,20}>/g, '')
        .replace(/<@&\d{17,20}>/g, '')
        .replace(/<#\d{17,20}>/g, '')
        .replace(/[\r\n]+/g, '')
        .replace(/^(?:r|u)\//i, '')
        .trim();
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,30}$/.test(text)) return text;
    return fallback;
}

async function fetchJson(url) {
    const signal = AbortSignal.timeout(MEME_TIMEOUT_MS);
    const response = await fetch(url, {
        signal,
        headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return readJson(response, signal);
}

let memePool = [];
let poolExpires = 0;
let refillJob = null;
async function refill() {
    for (const source of SOURCES) {
        for (let attempt = 0; attempt < UNSAFE_ATTEMPTS; attempt += 1) {
            try {
                const safe = source.parse(await fetchJson(source.url)).filter(isSafePost).slice(0, 25);
                if (safe.length) { memePool = safe; poolExpires = Date.now() + 60000; return; }
            } catch (error) {
                console.error(`Anime meme source ${source.id} failed.`);
                break;
            }
        }
    }
    return null;
}

async function loadMeme() {
    if (poolExpires <= Date.now()) memePool = [];
    if (!memePool.length) {
        if (!refillJob) refillJob = refill().finally(() => { refillJob = null; });
        await refillJob;
    }
    if (!memePool.length) return null;
    return memePool.splice(Math.floor(Math.random() * memePool.length), 1)[0];
}

function missingPayload() {
    return {
        content: MEME_ERROR,
        flags: MessageFlags.Ephemeral,
        allowedMentions: allowedMentions(),
    };
}

module.exports = {
    MEME_TIMEOUT_MS,
    MEME_ERROR,
    USER_AGENT,
    UNSAFE_ATTEMPTS,
    SOURCES,
    isSafePost,
    pickSafe,
    parseMemeApi,
    parseReddit,
    sanitizeTitle,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Returns a random anime meme.')),
    category: 'anime',
    replies: 'public',
    configKey: 'MemeCommandStatus',
    checkDisabledChannels: true,
    example: '/meme',
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        try {
            const post = await (deps.loadMeme || loadMeme)();
            if (!post) return finish(interaction, missingPayload());
            const embed = styledEmbed({
                title: sanitizeTitle(post.title),
                url: post.postLink,
                label: 'meme',
                extra: [`r/${plainName(post.subreddit, 'animememes')}`, `u/${plainName(post.author, 'unknown')}`],
            }).setImage(post.url);
            await finish(interaction, {
                embeds: [embed],
                allowedMentions: allowedMentions(),
            });
        } catch (error) {
            console.error('Anime meme reply failed.');
            try {
                if (!interaction.replied) await finish(interaction, missingPayload());
            } catch (replyError) {
                if (!isQuietError(replyError)) console.error('Anime meme error reply failed.');
            }
        }
    },
};
