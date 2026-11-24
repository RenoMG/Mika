const assert = require('node:assert/strict');
const { before, after, beforeEach, describe, test } = require('node:test');
const { ChannelType, PermissionFlagsBits, TextInputStyle } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const { delayMs, fromAnilist } = require('../src/anime/client');
const { createCache } = require('../src/anime/cache');
const {
    GUESS_CACHE_TARGET,
    GUESS_CACHE_TTL_MS,
    GUESS_CRYSTALS,
    GUESS_FRESH_CHANCE,
    GUESS_PLAY_LIMIT,
    GUESS_PLAY_WINDOW_MS,
    SHIKIMORI_MAX_PER_MINUTE,
    SHIKIMORI_MIN_INTERVAL_MS,
    SHIKIMORI_USER_AGENT,
} = require('../src/guess/constants');
const { createLocks } = require('../src/guess/lock');
const { guessMatches, normalizeGuess } = require('../src/guess/match');
const { judgePlays, limitMessage } = require('../src/guess/plays');
const { excludeRecent, pickScreenshot, planSource, rememberUse } = require('../src/guess/policy');
const { buildGuessBoard, pageCount, rowsFrom } = require('../src/guess/board');
const {
    claimGuess,
    createRegistry,
    guessesLeftText,
    messageFor,
    promptPayload,
    roundLockKey,
    routeGuess,
    startRound,
    watchChannel,
} = require('../src/guess/round');
const { canPost, createScheduler, dropRound } = require('../src/guess/scheduler');
const {
    createShotLimiter,
    fetchScreenshots,
    parseScreenshots,
} = require('../src/guess/shikimori');

const GUILD = '123456789012345678';
const OTHER_GUILD = '223456789012345679';
const USER = '323456789012345678';
const CHANNEL = '423456789012345678';
const OWNER = '523456789012345678';
const SHOT = 'https://shikimori.io/system/screenshots/original/bebop.jpg';

const bebop = {
    id: '1',
    idMal: 1,
    source: 'AniList',
    url: 'https://anilist.co/anime/1',
    titles: {
        romaji: 'Cowboy Bebop',
        english: 'Cowboy Bebop',
        native: 'カウボーイビバップ',
    },
    synonyms: ['Cowboy Bebop: The Movie'],
    synopsis: 'Bounty hunters.',
};

function rolls(values) {
    let index = 0;
    return () => {
        const value = values[Math.min(index, values.length - 1)];
        index += 1;
        return value;
    };
}

function response(status, body) {
    return { status, json: async () => body };
}

function shotApi(handler) {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url: String(url), init });
        return handler(String(url), init, calls);
    };
    const limiter = createShotLimiter({ minIntervalMs: 0, maxPerWindow: 1000, sleep: async () => {} });
    const cache = createCache({ max: 20, ttlMs: 60000, now: () => 0 });
    return {
        calls,
        fetchScreenshots(id, options = {}) {
            return fetchScreenshots(id, {
                ...options,
                fetch: fetchImpl,
                limiter,
                cache,
            });
        },
    };
}

function anilistRow(id, extra = {}) {
    return {
        id,
        idMal: id,
        isAdult: false,
        siteUrl: `https://anilist.co/anime/${id}`,
        description: 'A story.',
        episodes: 12,
        status: 'FINISHED',
        averageScore: 80,
        genres: ['Action'],
        synonyms: [`Alias ${id}`],
        title: { romaji: `Show ${id}`, english: `Show ${id}`, native: '' },
        tags: [],
        studios: { nodes: [] },
        startDate: { year: 2000, month: 1, day: 1 },
        endDate: { year: 2000, month: 4, day: 1 },
        coverImage: { large: '' },
        popularity: 20000,
        ...extra,
    };
}

test('titles ignore case, punctuation, spacing, and diacritics, and typos count', () => {
    assert.equal(normalizeGuess('  Shingeki no Kyōjin! '), 'shingeki no kyojin');
    assert.equal(normalizeGuess('Attack   on\tTITAN'), 'attack on titan');
    assert.equal(guessMatches('  COWBOY-bebop!! ', bebop), true);
    assert.equal(guessMatches('cowboi bebop', bebop), true);
    assert.equal(guessMatches('Shingeki no Kyōjin', {
        titles: { romaji: 'Shingeki no Kyojin', english: '', native: '' },
        synonyms: [],
    }), true);
    assert.equal(guessMatches('カウボーイビバップ', bebop), true);
    assert.equal(guessMatches('cowboy bebop the movie', bebop), true);
    assert.equal(guessMatches('one piec', {
        titles: { romaji: 'One Piece', english: 'One Piece', native: '' },
        synonyms: [],
    }), true);
});

test('short guesses, wrong titles, and tiny substrings do not match', () => {
    assert.equal(guessMatches('bebop', bebop), false);
    assert.equal(guessMatches('cowboy', bebop), false);
    assert.equal(guessMatches('a', bebop), false);
    assert.equal(guessMatches('naruto', bebop), false);
    assert.equal(guessMatches('.*', bebop), false);
    assert.equal(guessMatches('{$gt:""}', bebop), false);
    assert.equal(guessMatches('((((', bebop), false);
    assert.equal(guessMatches('fma', {
        titles: { romaji: 'FMA', english: '', native: '' },
        synonyms: [],
    }), true);
    assert.equal(guessMatches('fm', {
        titles: { romaji: 'FMA', english: '', native: '' },
        synonyms: [],
    }), false);
    assert.equal(guessMatches('fmaa', {
        titles: { romaji: 'FMA', english: '', native: '' },
        synonyms: [],
    }), false);
    assert.equal(guessMatches('piece', {
        titles: { romaji: 'One Piece', english: '', native: '' },
        synonyms: [],
    }), false);
    const state = { settled: false };
    assert.equal(claimGuess(state, { content: 'nope', author: { id: USER, bot: false } }, bebop), false);
    assert.equal(claimGuess(state, { content: 'Cowboy Bebop', author: { id: USER, bot: true } }, bebop), false);
    assert.equal(claimGuess(state, { content: 'Cowboy Bebop', author: { id: USER, bot: false } }, bebop), true);
    assert.equal(claimGuess(state, { content: 'Cowboy Bebop', author: { id: '623456789012345678', bot: false } }, bebop), false);
});

test('the rolling hour blocks the 11th play and names the reset time', () => {
    assert.equal(GUESS_PLAY_WINDOW_MS, 60 * 60 * 1000);
    const start = 1_700_000_000_000;
    let plays = [];
    for (let index = 0; index < GUESS_PLAY_LIMIT; index += 1) {
        const judged = judgePlays(plays, start + index * 1000);
        assert.equal(judged.allowed, true);
        plays = [...judged.plays, start + index * 1000];
    }
    const blocked = judgePlays(plays, start + 30_000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.nextAt, start + GUESS_PLAY_WINDOW_MS);
    const message = limitMessage(blocked.nextAt);
    assert.match(message, /this hour/);
    assert.match(message, /<t:1700003600:R>/);
    assert.match(message, /<t:1700003600:t>/);
    const opened = judgePlays(plays, start + GUESS_PLAY_WINDOW_MS);
    assert.equal(opened.allowed, true);
    assert.equal(opened.plays.length, GUESS_PLAY_LIMIT - 1);
    assert.equal(guessesLeftText(2), '2 guesses left this hour');
    assert.equal(guessesLeftText(1), '1 guess left this hour');
    assert.equal(guessesLeftText(0), '');
    assert.equal(guessesLeftText(3), '');
    assert.equal(guessesLeftText(GUESS_PLAY_LIMIT), '');
    const twoLeft = promptPayload(SHOT, { manual: true, remaining: 2 }).embeds[0].data.footer.text;
    const oneLeft = promptPayload(SHOT, { manual: true, remaining: 1 }).embeds[0].data.footer.text;
    assert.equal(twoLeft.endsWith('2 guesses left this hour'), true);
    assert.equal(oneLeft.endsWith('1 guess left this hour'), true);
    assert.equal(/1 guesses left/.test(oneLeft), false);
    assert.equal(promptPayload(SHOT).embeds[0].data.footer.text.includes('left'), false);
});

test('the plays-left footer appears only at 2 and at 1, and it is the last footer segment', () => {
    const base = 'Mika | 🎌 guess';
    const twoPhrase = '2 guesses left this hour';
    const onePhrase = '1 guess left this hour';
    for (const remaining of [3, 4, 9, GUESS_PLAY_LIMIT, 0, -1, 1.5, null]) {
        assert.equal(guessesLeftText(remaining), '');
        const quiet = promptPayload(SHOT, { manual: true, remaining }).embeds[0].data.footer.text;
        assert.equal(quiet, base);
        assert.equal(quiet.includes('left'), false);
        assert.equal(quiet.includes('guesses'), false);
    }
    const two = promptPayload(SHOT, { manual: true, remaining: 2 }).embeds[0].data.footer.text;
    const one = promptPayload(SHOT, { manual: true, remaining: 1 }).embeds[0].data.footer.text;
    assert.equal(two, `${base} • ${twoPhrase}`);
    assert.equal(one, `${base} • ${onePhrase}`);
    assert.equal(two.endsWith(twoPhrase), true);
    assert.equal(one.endsWith(onePhrase), true);
    assert.equal(two.split(' • ').at(-1), twoPhrase);
    assert.equal(one.split(' • ').at(-1), onePhrase);
    assert.equal(two.indexOf(twoPhrase), two.length - twoPhrase.length);
    assert.equal(one.indexOf(onePhrase), one.length - onePhrase.length);
    assert.ok(two.indexOf(base) < two.indexOf(twoPhrase));
    assert.ok(one.indexOf(base) < one.indexOf(onePhrase));
    assert.equal(promptPayload(SHOT, { manual: false, remaining: 2 }).embeds[0].data.footer.text, base);
    assert.equal(promptPayload(SHOT, { manual: false, remaining: 1 }).embeds[0].data.footer.text, base);
    assert.equal(promptPayload(SHOT, { remaining: 1 }).embeds[0].data.footer.text, base);
});

test('one channel lock, leaderboard order, and paging', () => {
    const gate = createLocks();
    assert.equal(gate.acquire(CHANNEL), true);
    assert.equal(gate.acquire(CHANNEL), false);
    assert.equal(gate.acquire('523456789012345671'), true);
    gate.release(CHANNEL);
    assert.equal(gate.acquire(CHANNEL), true);

    const rows = rowsFrom([
        { userID: '300000000000000003', wins: 1 },
        { userID: '300000000000000002', wins: 5 },
        { userID: '300000000000000009', wins: 5, crystals: 9999 },
        { userID: '300000000000000004', wins: 0, crystals: 5000 },
        { userID: '300000000000000008', wins: 9 },
    ], (id) => (id === '300000000000000008'
        ? { bot: true, username: 'Bot' }
        : { username: `U${id.slice(-1)}` }));
    assert.deepEqual(rows.map((row) => row.userID), [
        '300000000000000002',
        '300000000000000009',
        '300000000000000003',
    ]);
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].wins, 5);

    const entries = Array.from({ length: 12 }, (_, index) => ({
        userID: String(400000000000000000 + index),
        username: `Player${index + 1}`,
        wins: 12 - index,
        position: index + 1,
        departed: false,
    }));
    assert.equal(pageCount(entries.length), 2);
    assert.equal(pageCount(50), 5);
    const first = buildGuessBoard({ guildName: 'Server', entries, page: 0 });
    assert.match(first.embeds[0].data.description, /^👑 Player1 - Wins: 12/);
    assert.match(first.embeds[0].data.description, /🥈 Player2/);
    assert.match(first.embeds[0].data.description, /🥉 Player3/);
    assert.match(first.embeds[0].data.footer.text, /Page 1 \/ 2/);
    assert.equal(first.embeds[0].data.description.split('\n').length, 10);
    assert.equal(first.components[0].toJSON().components[0].disabled, true);
    const second = buildGuessBoard({ guildName: 'Server', entries, page: 1 });
    assert.equal(second.embeds[0].data.description.split('\n').length, 2);
    assert.match(second.embeds[0].data.description, /Player12/);
    assert.equal(second.components[0].toJSON().components[1].disabled, true);
    assert.equal(first.allowedMentions.parse.length, 0);
});

test('Shikimori paths are prefixed, rate limited, and failures do not start a fetch result', async () => {
    assert.equal(SHIKIMORI_MIN_INTERVAL_MS, 200);
    assert.equal(SHIKIMORI_MAX_PER_MINUTE, 90);
    assert.ok(GUESS_FRESH_CHANCE >= 0.1 && GUESS_FRESH_CHANCE <= 0.15);
    assert.equal(GUESS_CACHE_TARGET, 200);
    const now = 100_000;
    assert.ok(delayMs({
        now,
        stamps: [now - 100],
        pauseUntil: 0,
        minIntervalMs: SHIKIMORI_MIN_INTERVAL_MS,
        maxPerWindow: SHIKIMORI_MAX_PER_MINUTE,
        windowMs: 60_000,
    }) >= 100);
    assert.ok(delayMs({
        now,
        stamps: Array.from({ length: 90 }, (_, index) => now - 50_000 + index),
        pauseUntil: 0,
        minIntervalMs: SHIKIMORI_MIN_INTERVAL_MS,
        maxPerWindow: SHIKIMORI_MAX_PER_MINUTE,
        windowMs: 60_000,
    }) > 0);

    const parsed = parseScreenshots([
        { original: '/system/screenshots/original/a.jpg', preview: '/system/screenshots/x332/a.jpg' },
        { original: 'https://shikimori.io/system/screenshots/original/b.jpg' },
        { original: 'https://evil.example/a.jpg' },
        { original: '//evil.example/a.jpg' },
    ]);
    assert.deepEqual(parsed.urls, [
        'https://shikimori.io/system/screenshots/original/a.jpg',
        'https://shikimori.io/system/screenshots/original/b.jpg',
    ]);
    assert.equal(parseScreenshots({ error: 'nope' }).down, true);

    const listed = shotApi(() => response(200, [{ original: '/system/screenshots/original/a.jpg' }]));
    const hit = await listed.fetchScreenshots(1);
    assert.equal(hit.ok, true);
    assert.equal(hit.urls[0], 'https://shikimori.io/system/screenshots/original/a.jpg');
    assert.equal(listed.calls[0].init.headers['User-Agent'], SHIKIMORI_USER_AGENT);
    assert.match(listed.calls[0].url, /^https:\/\/shikimori\.io\/api\/animes\/1\/screenshots$/);
    const cached = await listed.fetchScreenshots(1);
    assert.equal(cached.cached, true);
    assert.equal(listed.calls.length, 1);

    const down = shotApi(() => response(503, { error: 'down' }));
    assert.equal((await down.fetchScreenshots(2)).down, true);
    const empty = shotApi(() => response(404, null));
    assert.deepEqual(await empty.fetchScreenshots(3), { ok: true, urls: [] });
    const timedOut = shotApi(() => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
    });
    assert.equal((await timedOut.fetchScreenshots(4)).down, true);

    const safe = fromAnilist(anilistRow(7));
    assert.equal(safe.idMal, 7);
    assert.equal(fromAnilist(anilistRow(8, { idMal: null })).idMal, null);
    assert.equal(fromAnilist(anilistRow(9, { isAdult: true })), null);
});

test('a round stays locked, manual plays are refunded when Shikimori is down, and auto play is free', async () => {
    const gate = createLocks();
    const personal = roundLockKey({ manual: true, userId: USER, channelId: CHANNEL });
    gate.acquire(personal);
    let chose = false;
    const busy = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        manual: true,
        hasContentIntent: true,
        locks: gate,
        choose: async () => {
            chose = true;
            return { ok: true, url: SHOT, media: bebop };
        },
        send: async () => {},
    });
    assert.equal(busy.busy, true);
    assert.equal(chose, false);
    assert.match(messageFor(busy), /already have a round running/);
    gate.release(personal);

    let refunded = null;
    const down = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        manual: true,
        hasContentIntent: true,
        locks: gate,
        peekAndConsume: async () => ({ allowed: true, stamp: 50 }),
        refund: async (_user, _guild, stamp) => {
            refunded = stamp;
        },
        choose: async () => ({ ok: false, down: true }),
        send: async () => {
            throw new Error('should not send');
        },
    });
    assert.equal(down.down, true);
    assert.equal(refunded, 50);
    assert.equal(gate.held(personal), false);
    assert.match(messageFor(down), /Shikimori/);

    const limited = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        manual: true,
        hasContentIntent: true,
        locks: gate,
        peekAndConsume: async () => ({ allowed: false, nextAt: 1_700_000_000_000 }),
        choose: async () => {
            throw new Error('should not choose');
        },
        send: async () => {},
    });
    assert.equal(limited.limited, true);
    assert.match(messageFor(limited), /<t:1700000000:R>/);
    assert.match(messageFor(limited), /<t:1700000000:t>/);
    assert.equal(gate.held(personal), false);

    let consumed = false;
    const sent = [];
    const auto = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        manual: false,
        hasContentIntent: true,
        locks: gate,
        peekAndConsume: async () => {
            consumed = true;
            return { allowed: true, stamp: 1 };
        },
        choose: async () => ({ ok: true, url: SHOT, media: bebop, source: 'cache' }),
        send: async (payload) => {
            sent.push(payload);
        },
        attach() {},
    });
    assert.equal(auto.ok, true);
    assert.equal(consumed, false);
    assert.equal(sent[0].embeds[0].data.title, 'Guess That Anime');
    assert.equal(sent[0].embeds[0].data.image.url, SHOT);
    assert.equal(JSON.stringify(sent[0].embeds[0].data).includes('Cowboy'), false);
    assert.equal(sent[0].embeds[0].data.footer.text.includes('left'), false);
    assert.deepEqual(sent[0].allowedMentions.parse, []);
    gate.release(roundLockKey({ manual: false, channelId: CHANNEL }));

    const missing = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        manual: false,
        hasContentIntent: false,
        locks: gate,
        send: async () => {},
    });
    assert.equal(missing.intent, true);
    assert.match(messageFor(missing), /MESSAGE CONTENT INTENT/);
});

test('the first correct guess wins and a timeout reveals the answer', async () => {
    function fakeChannel() {
        const handlers = {};
        return {
            createMessageCollector() {
                return {
                    on(event, fn) {
                        handlers[event] = fn;
                    },
                    stop(reason) {
                        if (handlers.end) handlers.end([], reason);
                    },
                };
            },
            emit(message) {
                return handlers.collect(message);
            },
            end(reason) {
                return handlers.end([], reason);
            },
        };
    }

    const gate = createLocks();
    gate.acquire(CHANNEL);
    const awards = [];
    const messages = [];
    const channel = fakeChannel();
    const { watchChannel } = require('../src/guess/round');
    watchChannel(channel, { channelId: CHANNEL, guildId: GUILD, media: bebop }, {
        locks: gate,
        award: async (id) => {
            awards.push(String(id));
        },
        announce: async (payload) => {
            messages.push(payload);
        },
    });
    await channel.emit({
        content: 'Cowboy Bebop',
        author: { id: '623456789012345678', bot: true, username: 'Bot' },
        channelId: CHANNEL,
    });
    await channel.emit({
        content: 'nope',
        author: { id: USER, bot: false, username: 'Reno' },
        channelId: CHANNEL,
    });
    await channel.emit({
        content: 'Cowboy Bebop',
        author: { id: USER, bot: false, username: 'Reno' },
        channelId: CHANNEL,
    });
    await channel.emit({
        content: 'Cowboy Bebop',
        author: { id: '623456789012345671', bot: false, username: 'Late' },
        channelId: CHANNEL,
    });
    assert.deepEqual(awards, [USER]);
    assert.equal(messages.length, 1);
    assert.match(messages[0].content, /Reno got it/);
    assert.match(messages[0].content, /\+50 crystals/);
    assert.equal(messages[0].embeds[0].data.title, 'Cowboy Bebop');
    assert.deepEqual(messages[0].allowedMentions.parse, []);
    assert.equal(gate.held(CHANNEL), false);

    gate.acquire(CHANNEL);
    const timeoutChannel = fakeChannel();
    const revealed = [];
    watchChannel(timeoutChannel, { channelId: CHANNEL, guildId: GUILD, media: bebop }, {
        locks: gate,
        award: async () => {
            throw new Error('nobody won');
        },
        announce: async (payload) => {
            revealed.push(payload);
        },
    });
    await timeoutChannel.end('time');
    assert.equal(revealed.length, 1);
    assert.match(revealed[0].content, /Time's up/);
    assert.equal(revealed[0].embeds[0].data.title, 'Cowboy Bebop');
    assert.equal(gate.held(CHANNEL), false);
});

test('personal rounds stay with their owner, and one message resolves one round', async () => {
    const other = '623456789012345671';
    const stranger = '723456789012345679';
    const naruto = {
        id: '20',
        idMal: 20,
        titles: { romaji: 'Naruto', english: 'Naruto', native: '' },
        synonyms: [],
    };

    function fakeChannel() {
        const handlers = {};
        return {
            createMessageCollector() {
                return {
                    on(event, fn) {
                        handlers[event] = fn;
                    },
                    stop(reason) {
                        if (handlers.end) handlers.end([], reason);
                    },
                };
            },
            emit(message) {
                return handlers.collect(message);
            },
            end(reason) {
                return handlers.end && handlers.end([], reason);
            },
        };
    }

    function message(content, id, name) {
        return {
            content,
            channelId: CHANNEL,
            author: { id, bot: false, username: name },
            member: { displayName: name },
        };
    }

    const gate = createLocks();
    const registry = createRegistry();
    const channel = fakeChannel();
    const awards = [];
    const revealed = [];
    const prompts = [];
    const mediaFor = new Map();

    async function play(userId, manual, ownerName) {
        return startRound({
            channelId: CHANNEL,
            guildId: GUILD,
            userId,
            ownerName,
            manual,
            hasContentIntent: true,
            locks: gate,
            peekAndConsume: async () => ({
                allowed: true,
                stamp: Date.now(),
                remaining: userId === USER ? 2 : 1,
            }),
            choose: async () => ({ ok: true, url: SHOT, media: mediaFor.get(manual ? userId : 'auto') }),
            send: async (payload) => {
                prompts.push(payload);
            },
            attach: (round) => watchChannel(channel, round, {
                locks: gate,
                registry,
                award: async (id) => {
                    awards.push(String(id));
                },
                announce: async (payload) => {
                    revealed.push(payload);
                },
            }),
        });
    }

    mediaFor.set(USER, bebop);
    mediaFor.set(other, naruto);
    const mine = await play(USER, true, 'Reno');
    const theirs = await play(other, true, 'Alex');
    assert.equal(mine.ok, true);
    assert.equal(theirs.ok, true);
    assert.equal(prompts[0].embeds[0].data.footer.text.endsWith('2 guesses left this hour'), true);
    assert.equal(prompts[1].embeds[0].data.footer.text.endsWith('1 guess left this hour'), true);
    assert.equal(prompts[0].embeds[0].data.footer.text.split(' • ').at(-1), '2 guesses left this hour');
    assert.equal(prompts[1].embeds[0].data.footer.text.split(' • ').at(-1), '1 guess left this hour');
    assert.equal(/1 guesses left/.test(prompts[1].embeds[0].data.footer.text), false);
    assert.deepEqual(prompts[0].allowedMentions.users, []);
    const again = await play(USER, true, 'Reno');
    assert.equal(again.busy, true);

    await channel.emit(message('Cowboy Bebop', stranger, 'Sam'));
    await channel.emit(message('Cowboy Bebop', other, 'Alex'));
    await channel.emit(message('Naruto', USER, 'Reno'));
    await channel.emit({
        content: 'Cowboy Bebop',
        channelId: CHANNEL,
        author: { id: USER, bot: true, username: 'Bot' },
    });
    assert.deepEqual(awards, []);
    assert.equal(gate.held(mine.lockKey), true);
    assert.equal(gate.held(theirs.lockKey), true);

    await channel.emit(message('Cowboy Bebop', USER, 'Reno'));
    assert.deepEqual(awards, [USER]);
    assert.equal(gate.held(mine.lockKey), false);
    assert.equal(gate.held(theirs.lockKey), true);
    assert.match(revealed[0].content, /Reno got it/);
    assert.equal(revealed[0].content.includes('<@'), false);
    assert.deepEqual(revealed[0].allowedMentions.parse, []);
    assert.deepEqual(revealed[0].allowedMentions.users, []);

    await channel.emit(message('Naruto', other, 'Alex'));
    assert.deepEqual(awards, [USER, other]);
    assert.equal(gate.held(theirs.lockKey), false);

    const both = createRegistry();
    const bothChannel = fakeChannel();
    const bothAwards = [];
    const bothRevealed = [];
    mediaFor.set('auto', bebop);
    const personal = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        ownerName: 'Reno',
        manual: true,
        hasContentIntent: true,
        locks: gate,
        peekAndConsume: async () => ({ allowed: true, stamp: 1, remaining: 2 }),
        choose: async () => ({ ok: true, url: SHOT, media: bebop }),
        send: async () => {},
        attach: (round) => watchChannel(bothChannel, round, {
            locks: gate,
            registry: both,
            award: async (id) => {
                bothAwards.push(String(id));
            },
            announce: async (payload) => {
                bothRevealed.push(payload);
            },
        }),
    });
    const auto = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        manual: false,
        hasContentIntent: true,
        locks: gate,
        choose: async () => ({ ok: true, url: SHOT, media: bebop }),
        send: async () => {},
        attach: (round) => watchChannel(bothChannel, round, {
            locks: gate,
            registry: both,
            award: async (id) => {
                bothAwards.push(String(id));
            },
            announce: async (payload) => {
                bothRevealed.push(payload);
            },
        }),
    });
    assert.equal(personal.ok, true);
    assert.equal(auto.ok, true);
    const open = [
        { key: personal.key, manual: true, userId: USER, channelId: CHANNEL, media: bebop },
        { key: auto.key, manual: false, channelId: CHANNEL, media: bebop },
    ];
    assert.equal(routeGuess(open, message('Cowboy Bebop', USER, 'Reno')), personal.key);
    assert.equal(routeGuess(open, message('Cowboy Bebop', other, 'Alex')), auto.key);
    await bothChannel.emit(message('Cowboy Bebop', USER, 'Reno'));
    assert.deepEqual(bothAwards, [USER]);
    assert.equal(gate.held(personal.lockKey), false);
    assert.equal(gate.held(auto.lockKey), true);
    await bothChannel.emit(message('Cowboy Bebop', USER, 'Reno'));
    assert.deepEqual(bothAwards, [USER, USER]);
    assert.equal(gate.held(auto.lockKey), false);

    const split = createRegistry();
    const splitChannel = fakeChannel();
    const splitAwards = [];
    const splitPersonal = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        ownerName: 'Reno',
        manual: true,
        hasContentIntent: true,
        locks: gate,
        peekAndConsume: async () => ({ allowed: true, stamp: 2, remaining: 1 }),
        choose: async () => ({ ok: true, url: SHOT, media: naruto }),
        send: async () => {},
        attach: (round) => watchChannel(splitChannel, round, {
            locks: gate,
            registry: split,
            award: async (id) => {
                splitAwards.push(`personal:${id}`);
            },
            announce: async () => {},
        }),
    });
    const splitAuto = await startRound({
        channelId: CHANNEL,
        guildId: GUILD,
        manual: false,
        hasContentIntent: true,
        locks: gate,
        choose: async () => ({ ok: true, url: SHOT, media: bebop }),
        send: async () => {},
        attach: (round) => watchChannel(splitChannel, round, {
            locks: gate,
            registry: split,
            award: async (id) => {
                splitAwards.push(`auto:${id}`);
            },
            announce: async () => {},
        }),
    });
    assert.equal(splitPersonal.ok, true);
    assert.equal(splitAuto.ok, true);
    await splitChannel.emit(message('Cowboy Bebop', USER, 'Reno'));
    assert.deepEqual(splitAwards, [`auto:${USER}`]);
    assert.equal(gate.held(splitPersonal.lockKey), true);
    assert.equal(gate.held(splitAuto.lockKey), false);
    await splitChannel.emit(message('Naruto', other, 'Alex'));
    assert.deepEqual(splitAwards, [`auto:${USER}`]);
    await splitChannel.emit(message('Naruto', USER, 'Reno'));
    assert.deepEqual(splitAwards, [`auto:${USER}`, `personal:${USER}`]);

    const timeoutGate = createLocks();
    const timeoutRegistry = createRegistry();
    const timeoutChannel = fakeChannel();
    const timeoutKey = roundLockKey({ manual: true, userId: USER, channelId: CHANNEL });
    timeoutGate.acquire(timeoutKey);
    const timeouts = [];
    timeoutRegistry.watch(timeoutChannel, {
        key: timeoutKey,
        lockKey: timeoutKey,
        channelId: CHANNEL,
        guildId: GUILD,
        userId: USER,
        manual: true,
        ownerName: 'Reno',
        media: bebop,
    }, {
        locks: timeoutGate,
        announce: async (payload) => {
            timeouts.push(payload);
        },
    });
    await timeoutChannel.end('time');
    assert.equal(timeouts.length, 1);
    assert.match(timeouts[0].content, /Time's up, Reno/);
    assert.match(timeouts[0].content, /Cowboy Bebop/);
    assert.equal(timeouts[0].content.includes('<@'), false);
    assert.deepEqual(timeouts[0].allowedMentions.parse, []);
    assert.deepEqual(timeouts[0].allowedMentions.users, []);
    assert.equal(timeouts[0].allowedMentions.repliedUser, false);
    assert.equal(timeoutGate.held(timeoutKey), false);
    registry.clear();
    both.clear();
    split.clear();
});

test('auto-drop does not stack timers and skips a missing channel or permission', async () => {
    const timers = new Map();
    let seq = 0;
    const sched = createScheduler({
        setTimer(fn, ms) {
            seq += 1;
            timers.set(seq, { fn, ms });
            return seq;
        },
        clearTimer(id) {
            timers.delete(id);
        },
        loadEnabled: async () => [GUILD, OTHER_GUILD],
        readConfig: async () => ({
            GuessStatus: [{ Status: 'true' }],
            GuessChannel: [{ Channel: CHANNEL }],
            GuessInterval: [{ Minutes: '12' }],
        }),
        drop: async () => ({ ok: true }),
    });
    await sched.start({});
    await sched.start({});
    assert.equal(timers.size, 2);
    assert.equal([...timers.values()][0].ms, 12 * 60 * 1000);
    const before = [...timers.keys()];
    await sched.syncGuild(GUILD);
    assert.equal(timers.size, 2);
    assert.equal(before.filter((id) => timers.has(id)).length, 1);
    const running = [...timers.values()][0];
    await running.fn();
    assert.equal(timers.size, 2);

    const missing = await dropRound({
        user: { id: USER },
        options: { intents: { has: () => true } },
        channels: {
            cache: { get: () => null },
            fetch: async () => {
                throw new Error('Unknown Channel');
            },
        },
    }, GUILD, {
        GuessStatus: [{ Status: 'true' }],
        GuessChannel: [{ Channel: CHANNEL }],
    });
    assert.equal(missing.skipped, 'channel');

    let sent = 0;
    const channel = {
        id: CHANNEL,
        guild: { id: GUILD },
        send: async () => {
            sent += 1;
        },
        permissionsFor: () => ({ has: () => false }),
    };
    const denied = await dropRound({
        user: { id: USER },
        options: { intents: { has: () => true } },
        channels: { cache: { get: () => channel }, fetch: async () => channel },
    }, GUILD, {
        GuessStatus: [{ Status: 'true' }],
        GuessChannel: [{ Channel: CHANNEL }],
    });
    assert.equal(denied.skipped, 'permissions');
    assert.equal(sent, 0);
    assert.equal(canPost(channel, { user: { id: USER } }), false);

    const command = require('../src/commands/guess/guess');
    const json = command.data.toJSON();
    assert.deepEqual(json.options.map((option) => option.name), ['play', 'leaderboard', 'stats']);
    assert.equal(json.options.every((option) => option.type === 1), true);
    assert.equal(json.contexts[0], 0);
    assert.equal(command.category, 'guess');
    const helpMenu = require('../src/commands/help/menu/helpMenu');
    const { Collection } = require('discord.js');
    const view = helpMenu.buildHelpView(helpMenu.groupCommands(new Collection([['guess', command]])), 'guess');
    const text = view.embeds.map((embed) => embed.data.description).join('\n');
    assert.match(view.embeds[0].data.title, /Guess That Anime/);
    assert.match(text, /\/guess play/);
    assert.match(text, /\/guess leaderboard/);
    assert.match(text, /\/guess stats/);
    assert.match(text, /only you answer/i);
    assert.match(text, /10 an hour/);
    assert.match(text, /checks yours first/);
    const play = json.options.find((option) => option.name === 'play');
    assert.ok(play.description.length <= 100);
});

describe('guess storage', { concurrency: false }, () => {
    let mongoose;
    let mongod;
    let store;
    let chooseRound;
    let panel;
    let ConfigurationDB;

    before(async () => {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        mongoose = require('mongoose');
        mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
        process.env.MIKADATABASE = mongod.getUri();
        process.env.MIKADATABASENAME = 'mika';
        await mongoose.connect(process.env.MIKADATABASE, { dbName: 'mika' });
        process.env.MONGO_CACHE_URI = process.env.MIKADATABASE;
        const { startCacheConnection } = require('../src/db/cacheConnection');
        const cache = startCacheConnection();
        if (cache) await cache.asPromise();
        store = require('../src/guess/store');
        ({ chooseRound } = require('../src/guess/select'));
        panel = require('../src/commands/configuration/handlers/panel');
        ConfigurationDB = require('../src/Models/ConfigurationDB');
    }, { timeout: 180000 });

    after(async () => {
        const { closeCacheConnection } = require('../src/db/cacheConnection');
        await closeCacheConnection();
        if (mongoose) await mongoose.disconnect();
        if (mongod) await mongod.stop();
    });

    function GuessAnime() {
        const model = require('../src/Models/GuessAnime').get();
        if (!model) throw new Error('GuessAnime is not on the cache connection');
        return model;
    }

    beforeEach(async () => {
        const GuessAnimeModel = GuessAnime();
        const GuessPlayer = require('../src/Models/GuessPlayer');
        const GuessGuild = require('../src/Models/GuessGuild');
        await GuessAnimeModel.deleteMany({});
        await GuessPlayer.deleteMany({});
        await GuessGuild.deleteMany({});
        await ConfigurationDB.deleteMany({});
    });

    function cacheDoc(id, extra = {}) {
        const anilistId = String(id);
        const doc = {
            anilistId,
            idMal: id,
            titles: { romaji: `Show ${anilistId}`, english: `Show ${anilistId}`, native: '' },
            synonyms: [`Alias ${anilistId}`],
            media: {
                id: anilistId,
                idMal: id,
                source: 'AniList',
                url: `https://anilist.co/anime/${anilistId}`,
                cover: '',
                titles: { romaji: `Show ${anilistId}`, english: `Show ${anilistId}`, native: '' },
                synonyms: [`Alias ${anilistId}`],
                synopsis: 'A show.',
                episodes: 12,
                status: 'FINISHED',
                score: 80,
                genres: ['Action'],
                tags: [],
                studios: [],
            },
            screenshots: [`https://shikimori.io/system/screenshots/original/${anilistId}.jpg`],
            fetchedAt: new Date(),
        };
        return { ...doc, ...extra, anilistId };
    }

    async function seed(count, mutate) {
        const docs = [];
        for (let id = 1; id <= count; id += 1) {
            const doc = cacheDoc(id);
            if (mutate) mutate(doc, id);
            docs.push(doc);
        }
        await GuessAnime().insertMany(docs);
    }

    function media(id, extra = {}) {
        return {
            id: String(id),
            idMal: id,
            source: 'AniList',
            url: `https://anilist.co/anime/${id}`,
            titles: { romaji: `Show ${id}`, english: `Show ${id}`, native: `ネイティブ${id}` },
            synonyms: [`Alias ${id}`],
            synopsis: 'Synopsis',
            isAdult: false,
            ...extra,
        };
    }

    test('below the threshold every round fetches and saves a new anime', async () => {
        const api = shotApi((url) => {
            const id = /animes\/(\d+)/.exec(url)[1];
            if (id === '1') return response(200, []);
            return response(200, [{ original: `/system/screenshots/original/${id}.jpg` }]);
        });
        const queue = [media(1, { idMal: null }), media(4), media(5)];
        let picks = 0;
        const first = await chooseRound(GUILD, {
            attempts: 4,
            random: () => 0,
            randomAnime: async () => {
                picks += 1;
                return { ok: true, media: queue.shift() };
            },
            fetchScreenshots: api.fetchScreenshots,
        });
        assert.equal(first.ok, true);
        assert.equal(first.source, 'fresh');
        assert.equal(first.anilistId, '4');
        assert.match(first.url, /shikimori\.io\/system\/screenshots\/original\/4\.jpg/);
        assert.equal(picks, 2);
        const saved = await store.loadAnime('4');
        assert.equal(saved.idMal, 4);
        assert.equal(saved.titles.english, 'Show 4');
        assert.equal(saved.synonyms[0], 'Alias 4');
        assert.ok(saved.fetchedAt);
        assert.equal(await store.countAnime(), 1);

        const second = await chooseRound(GUILD, {
            attempts: 2,
            random: () => 0,
            randomAnime: async () => ({ ok: true, media: queue.shift() }),
            fetchScreenshots: api.fetchScreenshots,
        });
        assert.equal(second.source, 'fresh');
        assert.equal(second.anilistId, '5');
        assert.equal(await store.countAnime(), 2);
    });

    test('a down Shikimori and a bounded empty list do not save or start', async () => {
        const down = shotApi(() => response(503, { message: 'down' }));
        const failed = await chooseRound(GUILD, {
            attempts: 4,
            random: () => 0,
            randomAnime: async () => ({ ok: true, media: media(8) }),
            fetchScreenshots: down.fetchScreenshots,
        });
        assert.equal(failed.down, true);
        assert.equal(down.calls.length, 1);
        assert.equal(await store.countAnime(), 0);

        const empty = shotApi(() => response(200, []));
        const none = await chooseRound(GUILD, {
            attempts: 2,
            random: () => 0,
            randomAnime: async () => ({ ok: true, media: media(9) }),
            fetchScreenshots: empty.fetchScreenshots,
        });
        assert.equal(none.empty, true);
        assert.equal(empty.calls.length, 2);
        assert.equal(await store.countAnime(), 0);
    });

    test('at the threshold most rounds are served from the cache and skip recent anime', async () => {
        await seed(GUESS_CACHE_TARGET);
        await store.saveGuild(GUILD, {
            recentIds: Array.from({ length: 50 }, (_, index) => String(index + 1)),
            shown: [],
        });
        let picks = 0;
        const served = await chooseRound(GUILD, {
            random: rolls([0.9, 0, 0]),
            randomAnime: async () => {
                picks += 1;
                return { ok: false, unavailable: true };
            },
            fetchScreenshots: async () => {
                throw new Error('cache hit should not call Shikimori');
            },
        });
        assert.equal(picks, 0);
        assert.equal(served.ok, true);
        assert.equal(served.source, 'cache');
        assert.equal(served.anilistId, '51');
        const guild = await store.loadGuild(GUILD);
        assert.equal(guild.recentIds[0], '51');
        assert.equal(guild.recentIds.length, 50);
        assert.equal(guild.recentIds.includes('50'), false);
        assert.equal(guild.recentIds.includes('1'), true);

        let freshPicks = 0;
        const api = shotApi(() => response(200, [{ original: '/system/screenshots/original/9000.jpg' }]));
        const grown = await chooseRound(GUILD, {
            random: rolls([0.05, 0]),
            randomAnime: async () => {
                freshPicks += 1;
                return { ok: true, media: media(9000) };
            },
            fetchScreenshots: api.fetchScreenshots,
        });
        assert.equal(freshPicks, 1);
        assert.equal(grown.source, 'fresh');
        assert.equal(grown.anilistId, '9000');
        assert.equal(await store.countAnime(), GUESS_CACHE_TARGET + 1);
    });

    test('screenshots rotate, then cycle after each one has been shown', async () => {
        const urls = [
            'https://shikimori.io/system/screenshots/original/a.jpg',
            'https://shikimori.io/system/screenshots/original/b.jpg',
            'https://shikimori.io/system/screenshots/original/c.jpg',
        ];
        await store.saveAnime(media(9), urls, Date.now());
        const picked = [];
        for (let index = 0; index < 4; index += 1) {
            const doc = await store.loadAnime('9');
            const shot = await store.takeScreenshot(GUILD, doc, () => 0);
            picked.push(shot.url);
        }
        assert.deepEqual(picked, [urls[0], urls[1], urls[2], urls[0]]);
        const guild = await store.loadGuild(GUILD);
        const shown = guild.shown.find((entry) => entry.animeId === '9');
        assert.deepEqual(shown.urls, [urls[0]]);
        assert.equal(pickScreenshot(urls, urls, () => 0).url, urls[0]);
        const remembered = rememberUse({ recentIds: [], shown: [] }, '9', [urls[0]]);
        assert.deepEqual(remembered.recentIds, ['9']);
        assert.equal(excludeRecent(['1', '2'], ['1']).includes('1'), false);
    });

    test('a stale cache entry is refreshed, and a failed refresh keeps the saved copy', async () => {
        const staleAt = new Date(Date.now() - GUESS_CACHE_TTL_MS - 86_400_000);
        await seed(GUESS_CACHE_TARGET, (doc, id) => {
            if (id === 51) doc.fetchedAt = staleAt;
        });
        await store.saveGuild(GUILD, {
            recentIds: Array.from({ length: 50 }, (_, index) => String(index + 1)),
            shown: [],
        });
        const api = shotApi(() => response(200, [{ original: '/system/screenshots/original/fresh.jpg' }]));
        const refreshed = await chooseRound(GUILD, {
            random: rolls([0.9, 0, 0]),
            now: () => Date.now(),
            getAnime: async (id) => media(id, {
                titles: { romaji: 'Updated Show', english: 'Updated Show', native: '' },
                synonyms: ['Updated'],
            }),
            fetchScreenshots: api.fetchScreenshots,
            randomAnime: async () => {
                throw new Error('stale refresh is not a new roll');
            },
        });
        assert.equal(refreshed.ok, true);
        assert.equal(refreshed.source, 'cache');
        assert.equal(refreshed.anilistId, '51');
        assert.match(refreshed.url, /fresh\.jpg/);
        assert.equal(refreshed.media.titles.english, 'Updated Show');
        const saved = await store.loadAnime('51');
        assert.equal(saved.titles.english, 'Updated Show');
        assert.ok(saved.fetchedAt.getTime() > staleAt.getTime());
        assert.equal(api.calls.length, 1);
        assert.equal(api.calls[0].init.headers['User-Agent'], SHIKIMORI_USER_AGENT);

        const GuessGuild = require('../src/Models/GuessGuild');
        await GuessAnime().deleteMany({});
        await GuessGuild.deleteMany({});
        await seed(GUESS_CACHE_TARGET, (doc, id) => {
            if (id === 51) doc.fetchedAt = staleAt;
        });
        await store.saveGuild(GUILD, {
            recentIds: Array.from({ length: 50 }, (_, index) => String(index + 1)),
            shown: [],
        });
        const broken = shotApi(() => response(503, { message: 'down' }));
        const fallback = await chooseRound(GUILD, {
            random: rolls([0.9, 0, 0]),
            now: () => Date.now(),
            getAnime: async (id) => media(id, {
                titles: { romaji: 'Should Not Stick', english: 'Should Not Stick', native: '' },
            }),
            fetchScreenshots: broken.fetchScreenshots,
        });
        assert.equal(fallback.ok, true);
        assert.equal(fallback.anilistId, '51');
        assert.match(fallback.url, /original\/51\.jpg/);
        const kept = await store.loadAnime('51');
        assert.equal(kept.titles.english, 'Show 51');
        assert.equal(new Date(kept.fetchedAt).getTime(), staleAt.getTime());
        assert.equal(planSource(199, 0.99), 'fresh');
        assert.equal(planSource(200, 0.5), 'cache');
        assert.equal(planSource(200, 0.05), 'fresh');
    });

    test('wins and crystals increase, the play limit is enforced, and the board is ordered', async () => {
        await assert.rejects(() => store.awardWin({ $gt: '' }, GUILD), TypeError);
        assert.equal(await store.countAnime(), 0);
        const first = await store.awardWin(USER, GUILD);
        const second = await store.awardWin(USER, GUILD);
        assert.equal(second.wins, 2);
        assert.equal(second.crystals, GUESS_CRYSTALS * 2);
        assert.equal(first.wins, 1);
        const other = await store.awardWin('623456789012345678', GUILD);
        assert.equal(other.wins, 1);
        assert.equal(other.crystals, GUESS_CRYSTALS);
        const mine = await store.readPlayer(USER, GUILD);
        assert.equal(mine.wins, 2);
        assert.equal(mine.crystals, 100);
        const board = await store.leaderboardDocs(GUILD);
        assert.deepEqual(board.map((row) => row.userID), [USER, '623456789012345678']);
        assert.equal(board[0].wins, 2);

        const start = 1_700_000_000_000;
        for (let index = 0; index < GUESS_PLAY_LIMIT; index += 1) {
            const played = await store.consumePlay('723456789012345678', GUILD, start + index * 1000);
            assert.equal(played.allowed, true);
            assert.equal(played.remaining, GUESS_PLAY_LIMIT - index - 1);
        }
        const blocked = await store.consumePlay('723456789012345678', GUILD, start + 30_000);
        assert.equal(blocked.allowed, false);
        assert.equal(blocked.nextAt, start + GUESS_PLAY_WINDOW_MS);
        assert.match(limitMessage(blocked.nextAt), /<t:\d+:R>/);
        const opened = await store.consumePlay('723456789012345678', GUILD, blocked.nextAt);
        assert.equal(opened.allowed, true);
        const refunded = await store.consumePlay('823456789012345678', GUILD, start);
        await store.refundPlay('823456789012345678', GUILD, refunded.stamp);
        const again = await store.readPlayer('823456789012345678', GUILD);
        assert.equal(again.wins, 0);
    });

    test('auto-drop config saves the channel, the switch, and a 5 to 60 minute interval', async () => {
        function member() {
            return {
                permissions: {
                    has(bit) {
                        return bit === PermissionFlagsBits.ManageGuild;
                    },
                },
            };
        }
        function component(overrides) {
            const interaction = {
                customId: overrides.customId,
                values: overrides.values || [],
                user: { id: OWNER },
                guild: { id: GUILD },
                member: member(),
                channels: overrides.channels,
                fields: overrides.fields,
                replies: [],
                updates: [],
                modals: [],
                async reply(body) {
                    this.replies.push(body);
                },
                async update(body) {
                    this.updates.push(body);
                },
                async showModal(modal) {
                    this.modals.push(modal);
                },
            };
            return interaction;
        }

        const menu = component({
            customId: `cfg:menu:guess:-:${OWNER}`,
            values: ['interval'],
        });
        await panel.handleConfigComponent(menu);
        const input = menu.modals[0].toJSON().components[0].components[0];
        assert.equal(input.style, TextInputStyle.Short);
        assert.equal(input.value, '10');
        assert.equal(input.max_length, 2);

        for (const bad of ['4', '61', '10min', '{$gt:1}']) {
            const rejected = component({
                customId: `cfg:modal:guess:interval:${OWNER}`,
                fields: { getTextInputValue: () => bad },
            });
            await panel.handleConfigModal(rejected);
            assert.equal(rejected.replies[0].content, panel.MINUTES_ERROR, bad);
        }

        const savedInterval = component({
            customId: `cfg:modal:guess:interval:${OWNER}`,
            fields: { getTextInputValue: () => '15' },
        });
        await panel.handleConfigModal(savedInterval);
        const enabled = component({ customId: `cfg:on:guess:status:${OWNER}` });
        await panel.handleConfigComponent(enabled);
        const channel = component({
            customId: `cfg:channel:guess:channel:${OWNER}`,
            channels: {
                first: () => ({
                    id: CHANNEL,
                    type: ChannelType.GuildText,
                    toString() {
                        return `<#${CHANNEL}>`;
                    },
                }),
            },
        });
        await panel.handleConfigComponent(channel);

        const doc = await ConfigurationDB.findOne({ GuildID: GUILD }).lean();
        assert.equal(doc.GuessStatus[0].Status, 'true');
        assert.equal(doc.GuessChannel[0].Channel, CHANNEL);
        assert.equal(doc.GuessInterval[0].Minutes, '15');
        const info = require('../src/commands/configuration/handlers/info');
        const page = info.configInfoEmbeds(doc).find((embed) => embed.data.description === 'Guess That Anime config');
        const fields = Object.fromEntries(page.data.fields.map((field) => [field.name, field.value]));
        assert.equal(fields['Auto-drop status'], '🟢 Enabled');
        assert.match(fields['Drop channel'], new RegExp(CHANNEL));
        assert.equal(fields['Drop interval'], '**15 minutes**');

        await ConfigurationDB.create({
            GuildID: OTHER_GUILD,
            GuessStatus: [{ Status: 'false' }],
            GuessChannel: [{ Channel: CHANNEL }],
            GuessInterval: [{ Minutes: '10' }],
        });
        const { loadEnabledGuilds } = require('../src/guess/scheduler');
        const enabledIds = await loadEnabledGuilds();
        assert.deepEqual(enabledIds, [GUILD]);
        const prompt = promptPayload(SHOT);
        assert.equal(prompt.allowedMentions.repliedUser, false);
        assert.equal(prompt.embeds[0].data.image.url, SHOT);
    });
});
