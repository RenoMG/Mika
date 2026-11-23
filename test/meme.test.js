const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const meme = require('../src/commands/anime/meme');

const SAFE = {
    title: '@everyone https://evil.example <@123456789012345678> *bold*',
    url: 'https://i.redd.it/safe.jpg',
    postLink: 'https://redd.it/safe123',
    author: 'cool_user',
    subreddit: 'animememes',
    nsfw: false,
    spoiler: false,
};

function jsonResponse(body, ok = true) {
    return {
        ok,
        status: ok ? 200 : 503,
        json: async () => body,
    };
}

function memeApi(memes) {
    return jsonResponse({ count: memes.length, memes });
}

function redditPost(data) {
    return { data };
}

async function run(fetchImpl) {
    const originalFetch = global.fetch;
    const originalTimeout = AbortSignal.timeout;
    const originalError = console.error;
    const calls = [];
    const timeouts = [];
    const logs = [];
    const replies = [];
    global.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        return fetchImpl(String(url), calls.length);
    };
    AbortSignal.timeout = (ms) => {
        timeouts.push(ms);
        return originalTimeout.call(AbortSignal, ms);
    };
    console.error = (...args) => {
        logs.push(args.map((part) => String(part)).join(' '));
    };
    try {
        await meme.execute({
            replied: false,
            deferred: false,
            reply: async (body) => replies.push(body),
        });
    } finally {
        global.fetch = originalFetch;
        AbortSignal.timeout = originalTimeout;
        console.error = originalError;
    }
    return { calls, timeouts, logs, replies };
}

test('anime memes use a short timeout, a batch, and a reddit fallback', () => {
    assert.equal(meme.MEME_TIMEOUT_MS, 4000);
    assert.equal(meme.UNSAFE_ATTEMPTS, 2);
    assert.equal(meme.SOURCES[0].url, 'https://meme-api.com/gimme/animememes/10');
    assert.equal(meme.SOURCES[1].url, 'https://www.reddit.com/r/Animemes/hot.json?limit=25&raw_json=1');
    assert.equal(meme.data.toJSON().name, 'meme');
    assert.equal(meme.category, 'anime');
});

test('nsfw, spoiler, stickied, and non-image posts are filtered', () => {
    const posts = meme.parseMemeApi({
        memes: [
            { ...SAFE, nsfw: true, title: 'nsfw post', url: 'https://i.redd.it/nsfw.jpg', postLink: 'https://redd.it/nsfw' },
            { ...SAFE, spoiler: true, title: 'spoiler post', url: 'https://i.redd.it/spoiler.jpg', postLink: 'https://redd.it/spoiler' },
            { ...SAFE, nsfw: undefined, title: 'unmarked', url: 'https://i.redd.it/unmarked.jpg', postLink: 'https://redd.it/unmarked' },
            { ...SAFE, title: 'http only', url: 'http://i.redd.it/plain.jpg', postLink: 'https://redd.it/http' },
            { ...SAFE, title: 'video', url: 'https://v.redd.it/clip.mp4', postLink: 'https://redd.it/video' },
            SAFE,
        ],
    });
    assert.equal(meme.pickSafe(posts).url, SAFE.url);

    const reddit = meme.parseReddit({
        data: {
            children: [
                redditPost({
                    title: 'spoiler',
                    url: 'https://i.redd.it/spoiler.png',
                    permalink: '/r/Animemes/comments/spoiler/title/',
                    author: 'someone',
                    subreddit: 'Animemes',
                    over_18: false,
                    spoiler: true,
                }),
                redditPost({
                    title: 'sticky',
                    url: 'https://i.redd.it/sticky.png',
                    permalink: '/r/Animemes/comments/sticky/title/',
                    author: 'mod',
                    subreddit: 'Animemes',
                    over_18: false,
                    spoiler: false,
                    stickied: true,
                }),
                redditPost({
                    title: 'safe reddit',
                    url: 'https://i.redd.it/reddit.png',
                    permalink: '/r/Animemes/comments/ok/title/',
                    author: 'poster',
                    subreddit: 'Animemes',
                    over_18: false,
                    spoiler: false,
                }),
            ],
        },
    });
    assert.equal(meme.pickSafe(reddit).title, 'safe reddit');
    assert.equal(meme.pickSafe(reddit).postLink, 'https://www.reddit.com/r/Animemes/comments/ok/title/');
});

test('a safe anime meme is embedded and unsafe posts are not used', async () => {
    const result = await run((url) => {
        assert.match(url, /meme-api\.com\/gimme\/animememes\/10/);
        return memeApi([
            { ...SAFE, nsfw: true, title: 'hidden nsfw RAW_BODY', url: 'https://i.redd.it/no.jpg', postLink: 'https://redd.it/no' },
            { ...SAFE, spoiler: true, title: 'hidden spoiler', url: 'https://i.redd.it/nope.jpg', postLink: 'https://redd.it/nope' },
            SAFE,
        ]);
    });
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.timeouts, [4000]);
    assert.ok(result.calls[0].options.signal instanceof AbortSignal);
    assert.equal(result.calls[0].options.headers['User-Agent'], meme.USER_AGENT);
    const reply = result.replies[0];
    const embed = reply.embeds[0].data;
    assert.equal(embed.title, 'everyone user bold');
    assert.equal(embed.url, SAFE.postLink);
    assert.equal(embed.image.url, SAFE.url);
    assert.equal(embed.footer.text, 'r/animememes · u/cool_user');
    assert.equal(reply.allowedMentions.parse.length, 0);
    assert.deepEqual(reply.allowedMentions.users, []);
    assert.equal(result.logs.length, 0);
    assert.equal(JSON.stringify(reply).includes('RAW_BODY'), false);
    assert.equal(JSON.stringify(reply).includes('@everyone'), false);
});

test('a dead meme-api uses the Animemes fallback', async () => {
    const result = await run((url, attempt) => {
        if (attempt === 1) return jsonResponse({ leak: 'SHOULD_NOT_LOG' }, false);
        assert.match(url, /reddit\.com\/r\/Animemes/);
        return jsonResponse({
            data: {
                children: [
                    redditPost({
                        title: 'fallback meme',
                        url: 'https://i.redd.it/fallback.png',
                        permalink: '/r/Animemes/comments/fall/title/',
                        author: 'fallback_user',
                        subreddit: 'Animemes',
                        over_18: false,
                        spoiler: false,
                    }),
                ],
            },
        });
    });
    assert.equal(result.calls.length, 2);
    assert.match(result.calls[1].url, /r\/Animemes/);
    assert.equal(result.replies[0].embeds[0].data.image.url, 'https://i.redd.it/fallback.png');
    assert.equal(result.replies[0].embeds[0].data.footer.text, 'r/Animemes · u/fallback_user');
    assert.equal(result.logs.join('\n').includes('SHOULD_NOT_LOG'), false);
    assert.match(result.logs.join('\n'), /meme-api failed/);
});

test('an all-unsafe batch is retried, then the fallback is used', async () => {
    const result = await run((url, attempt) => {
        if (attempt < 3) {
            return memeApi([{ ...SAFE, nsfw: true, title: 'only nsfw', url: 'https://i.redd.it/bad.jpg', postLink: 'https://redd.it/bad' }]);
        }
        assert.match(url, /r\/Animemes/);
        return jsonResponse({
            data: {
                children: [
                    redditPost({
                        title: 'second source',
                        url: 'https://i.redd.it/second.webp',
                        permalink: '/r/Animemes/comments/second/title/',
                        author: 'second_user',
                        subreddit: 'Animemes',
                        over_18: false,
                        spoiler: false,
                    }),
                ],
            },
        });
    });
    assert.equal(result.calls.length, 3);
    assert.match(result.calls[0].url, /animememes/);
    assert.match(result.calls[1].url, /animememes/);
    assert.equal(result.replies[0].embeds[0].data.title, 'second source');
});

test('every source down replies with an ephemeral error and does not log the body', async () => {
    const marker = 'FULL_RESPONSE_SHOULD_NOT_LOG {"title":"secret meme body"}';
    const result = await run(() => {
        throw new Error(marker);
    });
    assert.equal(result.calls.length, 2);
    assert.equal(result.replies.length, 1);
    assert.equal(result.replies[0].content, meme.MEME_ERROR);
    assert.equal(result.replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(result.replies[0].allowedMentions.parse.length, 0);
    const logged = result.logs.join('\n');
    assert.equal(logged.includes(marker), false);
    assert.equal(logged.includes('secret meme body'), false);
    assert.match(logged, /meme-api failed/);
    assert.match(logged, /reddit failed/);
});
