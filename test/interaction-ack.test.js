process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Collection, MessageFlags } = require('discord.js');
const { createLocks } = require('../src/guess/lock');
const { INTENT_MISSING, SHIKIMORI_DOWN } = require('../src/guess/constants');
const { limitMessage } = require('../src/guess/plays');
const { messageFor, startRound } = require('../src/guess/round');
const { defer, finish } = require('../src/utils/ack');
const { ANILIST_GENRES, filterChoices } = require('../src/anime/random');
const events = require('../src/events/interactionCreate');
const mod = require('../src/utils/moderation');
const guess = require('../src/commands/guess/guess');
const search = require('../src/commands/anime/search');
const randomanime = require('../src/commands/anime/randomanime');
const meme = require('../src/commands/anime/meme');
const profile = require('../src/commands/anime/profile');
const findprofile = require('../src/commands/anime/findprofile');
const link = require('../src/commands/anime/link');
const status = require('../src/commands/information/status');
const serverstats = require('../src/commands/information/serverstats');
const { openHub } = require('../src/commands/configuration/hub/hub');
const ban = require('../src/commands/moderation/ban');
const kick = require('../src/commands/moderation/kick');
const warn = require('../src/commands/moderation/warn');
const clear = require('../src/commands/moderation/clear');
const mute = require('../src/commands/moderation/mute');
const unmute = require('../src/commands/moderation/unmute');
const unban = require('../src/commands/moderation/unban');
const infractions = require('../src/commands/moderation/infractions');
const unwarn = require('../src/commands/moderation/unwarn');
const removeinfraction = require('../src/commands/moderation/removeinfraction');
const clearinfractions = require('../src/commands/moderation/clearinfractions');
const clearwarns = require('../src/commands/moderation/clearwarns');

const GUILD = '123456789012345678';
const USER = '323456789012345678';
const TARGET = '623456789012345678';
const BOT = '723456789012345678';
const CHANNEL = '423456789012345678';
const SHOT = 'https://shikimori.io/system/screenshots/original/bebop.jpg';
const TOKEN = 'bbbbbbbbbbbbbbbbbbbb.CCCCC.dddddddddddddddddddd';
const { GENERIC_ERROR: GENERIC } = require('../src/utils/messages');

const bebop = {
    id: '1',
    source: 'AniList',
    url: 'https://anilist.co/anime/1',
    titles: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: 'カウボーイビバップ' },
    synopsis: 'Bounty hunters.',
};

function ephemeralBits(body) {
    const flags = body && body.flags;
    const bits = typeof flags === 'bigint' ? Number(flags) : Number(flags && flags.bitfield != null ? flags.bitfield : flags);
    return (bits & MessageFlags.Ephemeral) === MessageFlags.Ephemeral;
}

function mentionsClosed(body) {
    assert.ok(body && body.allowedMentions);
    assert.deepEqual(body.allowedMentions.parse, []);
    assert.deepEqual(body.allowedMentions.roles, []);
    assert.equal(body.allowedMentions.repliedUser, false);
}

function track(options = {}) {
    const order = [];
    const edits = [];
    const follows = [];
    const replies = [];
    const responded = [];
    const strings = options.strings || {};
    const ints = options.ints || {};
    const bools = options.bools || {};
    let collector = null;
    let handlers = null;
    const channel = {
        id: options.channelId || CHANNEL,
        async send() {},
        messages: {
            fetch: async () => {
                order.push('fetch');
                throw new Error('messages down');
            },
        },
        createMessageCollector() {
            order.push('collector');
            handlers = {};
            collector = {
                on(event, fn) {
                    handlers[event] = fn;
                    return collector;
                },
                stop() {},
            };
            return collector;
        },
    };
    const interaction = {
        id: options.id || `ack-${options.channelId || CHANNEL}`,
        commandName: options.commandName || 'guess',
        createdTimestamp: options.createdTimestamp == null ? Date.now() : options.createdTimestamp,
        deferred: false,
        replied: false,
        responded: false,
        ephemeral: false,
        guildId: GUILD,
        channel: options.noChannel ? null : channel,
        guild: options.noGuild ? null : (options.guild || { id: GUILD, name: 'Guild' }),
        user: { id: options.userId || USER, username: 'reno', globalName: 'Reno', tag: 'reno#0001' },
        member: options.member || { id: USER, displayName: 'Reno', permissions: { has: () => true } },
        options: {
            getSubcommand: () => options.sub || 'play',
            getString: (name) => (Object.prototype.hasOwnProperty.call(strings, name) ? strings[name] : null),
            getInteger: (name) => (Object.prototype.hasOwnProperty.call(ints, name) ? ints[name] : null),
            getBoolean: (name) => (Object.prototype.hasOwnProperty.call(bools, name) ? bools[name] : null),
            getUser: () => (options.user === undefined ? null : options.user),
            getMember: () => (options.targetMember === undefined ? null : options.targetMember),
            getFocused: (full) => (full
                ? { name: options.focusName || 'genre', value: options.focused == null ? 'me' : options.focused }
                : (options.focused == null ? 'me' : options.focused)),
        },
        async deferReply(payload) {
            order.push('defer');
            this.deferred = true;
            const bits = payload && payload.flags;
            if (typeof bits === 'number' && (bits & MessageFlags.Ephemeral) === MessageFlags.Ephemeral) this.ephemeral = true;
        },
        async editReply(body) {
            order.push('edit');
            this.replied = true;
            edits.push(body);
            return {
                id: 'msg',
                createMessageComponentCollector() {
                    order.push('components');
                    return { on() { return this; } };
                },
            };
        },
        async followUp(body) {
            order.push('follow');
            follows.push(body);
        },
        async deleteReply() {
            order.push('delete');
        },
        async reply(body) {
            order.push('reply');
            replies.push(body);
            throw new Error('reply used after the interaction should have been deferred');
        },
        async respond(choices) {
            this.responded = true;
            responded.push(choices);
            if (options.respondError) throw options.respondError;
        },
        async showModal() {
            order.push('modal');
        },
    };
    return {
        interaction,
        order,
        edits,
        follows,
        replies,
        responded,
        get collector() { return collector; },
        get handlers() { return handlers; },
    };
}

function contentClient(hasContent) {
    return { options: { intents: { has: () => hasContent } } };
}

function roundHooks(order, overrides) {
    return {
        startRound: (args) => startRound({
            ...args,
            locks: createLocks(),
            peekAndConsume: async () => {
                order.push('fetch');
                return overrides.peek();
            },
            choose: async () => {
                order.push('choose');
                return overrides.choose();
            },
            refund: async () => {
                order.push('refund');
            },
        }),
    };
}

function assertDeferredBeforeWork(bag) {
    assert.equal(bag.order[0], 'defer');
    assert.ok(bag.order.includes('fetch'));
    assert.ok(bag.order.indexOf('defer') < bag.order.indexOf('fetch'));
    assert.equal(bag.order.includes('reply'), false);
}

async function whileAlive(run) {
    const keep = setInterval(() => {}, 20);
    try {
        return await run();
    } finally {
        clearInterval(keep);
    }
}

async function withLogs(run) {
    const logs = [];
    const original = console.error;
    console.error = (...args) => {
        logs.push(args.map((part) => (part instanceof Error ? `${part.name}: ${part.message}` : String(part))).join(' '));
    };
    try {
        await run();
    } finally {
        console.error = original;
    }
    return logs;
}

function rankedMember(id, position) {
    return {
        id,
        user: { id, username: 'name', tag: 'name#0001', bot: false },
        displayName: 'Name',
        displayAvatarURL: () => 'https://cdn.example/a.png',
        roles: { highest: { position }, cache: { has: () => false }, add: async () => {}, remove: async () => {} },
        permissions: { has: () => true },
        kick: async () => {
            throw new Error('kick down');
        },
        ban: async () => {
            throw new Error('ban down');
        },
    };
}

describe('slow interactions acknowledge first', { concurrency: 1 }, () => {
    it('falls back to reply when the interaction cannot defer', async () => {
        let sent = null;
        const interaction = {
            async reply(body) { sent = body; },
        };
        assert.equal(await defer(interaction), false);
        await finish(interaction, { content: 'still here', flags: MessageFlags.Ephemeral });
        assert.equal(sent.content, 'still here');
        assert.equal(ephemeralBits(sent), true);
        mentionsClosed(sent);
    });

    it('defers /guess play before the limit check and edits the personal prompt', async () => {
        const bag = track({ channelId: CHANNEL });
        const result = await guess.play(bag.interaction, contentClient(true), roundHooks(bag.order, {
            peek: () => ({ allowed: true, remaining: 2, stamp: 5, plays: [1] }),
            choose: () => ({ ok: true, url: SHOT, media: bebop, source: 'fresh' }),
        }));
        assert.equal(result.ok, true);
        assert.deepEqual(bag.order.filter((step) => step !== 'collector'), ['defer', 'fetch', 'choose', 'edit']);
        assert.ok(bag.order.indexOf('edit') < bag.order.indexOf('collector'));
        assert.equal(bag.follows.length, 0);
        assert.equal(bag.replies.length, 0);
        const prompt = bag.edits[0];
        assert.equal(ephemeralBits(prompt), false);
        mentionsClosed(prompt);
        assert.equal(prompt.embeds[0].data.footer.text, 'Mika · 🎯 Guess · 2 rounds left this hour');
        assert.match(prompt.embeds[0].data.description, /Only you can answer/);
        await bag.handlers.collect({
            content: 'nope',
            author: { id: USER, bot: false },
            channelId: CHANNEL,
        });
        assert.equal(result.ok, true);
    });

    it('edits the original reply for the hourly limit without deleting the command display', async () => {
        const nextAt = 1_700_003_600_000;
        const bag = track({ channelId: '423456789012345679' });
        const result = await guess.play(bag.interaction, contentClient(true), roundHooks(bag.order, {
            peek: () => ({ allowed: false, nextAt }),
            choose: () => {
                throw new Error('choose ran after the limit');
            },
        }));
        assert.equal(result && result.ok, undefined);
        assert.equal(bag.order.includes('choose'), false);
        assert.equal(bag.order.includes('reply'), false);
        assert.deepEqual(bag.order, ['defer', 'fetch', 'edit']);
        assert.equal(bag.follows.length, 0);
        assert.equal(bag.edits.length, 1);
        assert.equal(bag.edits[0].content, limitMessage(nextAt));
        assert.equal(ephemeralBits(bag.edits[0]), false);
        mentionsClosed(bag.edits[0]);
    });

    it('preserves the original /guess play reply when the router reaches the hourly limit', async () => {
        const nextAt = 1_700_003_600_000;
        const bag = track({ sub: 'play', commandName: 'guess' });
        bag.interaction.isChatInputCommand = () => true;
        const config = require('../src/utils/getGuildConfig');
        const original = config.getGuildConfig;
        config.getGuildConfig = async () => { bag.order.push('config'); return {}; };
        const hooks = roundHooks(bag.order, {
            peek: () => ({ allowed: false, nextAt }),
            choose: () => { throw new Error('choose ran after the limit'); },
        });
        const command = { ...guess, execute: (interaction, client) => guess.execute(interaction, client, hooks) };
        try {
            await events.execute(bag.interaction, {
                ...contentClient(true),
                commands: new Map([['guess', command]]),
            });
        } finally { config.getGuildConfig = original; }
        assert.equal(bag.interaction.ephemeral, false);
        assert.deepEqual(bag.order, ['defer', 'config', 'fetch', 'edit']);
        assert.equal(bag.follows.length, 0);
        assert.equal(bag.edits.length, 1);
        assert.equal(bag.edits[0].content, limitMessage(nextAt));
        mentionsClosed(bag.edits[0]);
    });

    it('keeps a screenshot failure private and refunds the play', async () => {
        const bag = track({ channelId: '423456789012345680' });
        await guess.play(bag.interaction, contentClient(true), roundHooks(bag.order, {
            peek: () => ({ allowed: true, remaining: 9, stamp: 8, plays: [1] }),
            choose: () => ({ ok: false, down: true }),
        }));
        assert.equal(bag.order.includes('edit'), false);
        assert.ok(bag.order.includes('refund'));
        assert.equal(bag.follows[0].content, SHIKIMORI_DOWN);
        assert.equal(ephemeralBits(bag.follows[0]), true);
        mentionsClosed(bag.follows[0]);
        assert.equal(bag.order[0], 'defer');
        assert.ok(bag.order.indexOf('defer') < bag.order.indexOf('fetch'));
    });

    it('defers before reporting a missing message-content intent', async () => {
        const bag = track({ channelId: '423456789012345681' });
        let fetched = false;
        await guess.play(bag.interaction, contentClient(false), {
            startRound: (args) => startRound({
                ...args,
                peekAndConsume: async () => {
                    fetched = true;
                    return { allowed: true };
                },
            }),
        });
        assert.equal(fetched, false);
        assert.deepEqual(bag.order, ['defer', 'delete', 'follow']);
        assert.equal(bag.follows[0].content, INTENT_MISSING);
        assert.equal(ephemeralBits(bag.follows[0]), true);
    });

    it('defers before an empty-channel error', async () => {
        const bag = track({ noChannel: true });
        let ran = false;
        await guess.play(bag.interaction, contentClient(true), {
            startRound: () => {
                ran = true;
            },
        });
        assert.equal(ran, false);
        assert.equal(bag.order[0], 'defer');
        assert.equal(bag.follows[0].content, messageFor({ empty: true }));
        assert.equal(ephemeralBits(bag.follows[0]), true);
    });

    it('defers /guess stats before the player read and shows it publicly', async () => {
        const bag = track({ sub: 'stats', commandName: 'guess' });
        await guess.execute(bag.interaction, contentClient(true), {
            readPlayer: async () => {
                bag.order.push('fetch');
                return { wins: 3, crystals: 9, streak: 2, bestStreak: 5, gaveUp: 4 };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.interaction.ephemeral, false);
        assert.equal(bag.follows.length, 0);
        assert.equal(ephemeralBits(bag.edits[0]), false);
        assert.equal(bag.edits[0].embeds[0].data.title, '🎯 Your guess stats');
        assert.equal(bag.edits[0].embeds[0].data.fields[0].value, '🏆 **3**');
        const statFields = Object.fromEntries(bag.edits[0].embeds[0].data.fields.map((field) => [field.name, field.value]));
        assert.equal(statFields['Gave up'], '🏳️ **4**');
        assert.equal(statFields.Streak, '🔥 **2**');
        assert.equal(statFields['Best streak'], '⭐ **5**');
        assert.match(bag.edits[0].embeds[0].data.footer.text, /Mika · 🎯 Guess/);
        mentionsClosed(bag.edits[0]);
    });

    it('shows another member\'s /guess stats for this server, and refuses non-members and bots', async () => {
        const OTHER = '200000000000000002';
        const other = { id: OTHER, username: 'mika_fan', globalName: 'Mika <@123456789012345678> Fan' };
        const read = [];
        const bag = track({ sub: 'stats', commandName: 'guess', user: other, targetMember: { id: OTHER, displayName: 'Fan **One**' } });
        await guess.execute(bag.interaction, contentClient(true), {
            readPlayer: async (userId, guildId) => { read.push([userId, guildId]); return { wins: 11, crystals: 2 }; },
        });
        assert.deepEqual(read, [[OTHER, GUILD]]);
        assert.equal(bag.interaction.ephemeral, false);
        assert.equal(bag.edits[0].embeds[0].data.title, "🎯 Fan One's guess stats");
        assert.equal(bag.edits[0].embeds[0].data.fields[0].value, '🏆 **11**');
        mentionsClosed(bag.edits[0]);

        const missing = track({ sub: 'stats', commandName: 'guess', user: other, targetMember: null });
        await guess.execute(missing.interaction, contentClient(true), { readPlayer: async () => { throw new Error('should not read'); } });
        const notice = missing.replies[0] || missing.follows[0];
        assert.match(notice.content, /isn't in this server/);
        assert.equal(ephemeralBits(notice), true);

        const bot = track({ sub: 'stats', commandName: 'guess', user: { ...other, bot: true }, targetMember: { id: OTHER } });
        await guess.execute(bot.interaction, contentClient(true), { readPlayer: async () => { throw new Error('should not read'); } });
        assert.match((bot.replies[0] || bot.follows[0]).content, /Bots don't play/);
    });

    it('routes /guess stats publicly from the first acknowledgement', async () => {
        const bag = track({ sub: 'stats', commandName: 'guess' });
        bag.interaction.isChatInputCommand = () => true;
        const config = require('../src/utils/getGuildConfig');
        const original = config.getGuildConfig;
        config.getGuildConfig = async () => { bag.order.push('config'); return {}; };
        const command = { ...guess, execute: (interaction, client) => guess.execute(interaction, client, {
            readPlayer: async () => { bag.order.push('fetch'); return { wins: 7, crystals: 350 }; },
        }) };
        try {
            await events.execute(bag.interaction, { commands: new Map([['guess', command]]) });
        } finally { config.getGuildConfig = original; }
        assert.equal(bag.interaction.ephemeral, false);
        assert.deepEqual(bag.order, ['defer', 'config', 'fetch', 'edit']);
        assert.equal(bag.follows.length, 0);
        assert.equal(bag.edits.length, 1);
        assert.equal(bag.edits[0].embeds[0].data.fields[0].value, '🏆 **7**');
    });

    it('keeps /guess play and /guess leaderboard public through the router', async () => {
        for (const sub of ['play', 'leaderboard']) {
            const bag = track({ sub, commandName: 'guess' });
            bag.interaction.isChatInputCommand = () => true;
            const command = { execute: async (interaction) => finish(interaction, { content: 'public' }) };
            await events.execute(bag.interaction, { commands: new Map([['guess', command]]) });
            assert.equal(bag.interaction.ephemeral, false);
            assert.deepEqual(bag.order, ['defer', 'edit']);
        }
    });

    it('replyError follows the interaction state and swallows 10062 and 40060', async () => {
        async function run(mode, replyThrows) {
            const calls = [];
            const interaction = {
                commandName: 'ackprobe',
                deferred: false,
                replied: false,
                guild: { id: GUILD },
                channel: { id: CHANNEL },
                isChatInputCommand: () => true,
                isButton: () => false,
                isAutocomplete: () => false,
                isModalSubmit: () => false,
                isStringSelectMenu: () => false,
                isChannelSelectMenu: () => false,
                isRoleSelectMenu: () => false,
                async reply(body) {
                    calls.push(['reply', body]);
                    if (replyThrows && mode === 'fresh') throw replyThrows;
                },
                async editReply(body) {
                    calls.push(['edit', body]);
                    if (replyThrows && mode === 'deferred') throw replyThrows;
                },
                async followUp(body) {
                    calls.push(['follow', body]);
                    if (replyThrows && mode === 'replied') throw replyThrows;
                },
            };
            const commands = new Collection();
            commands.set('ackprobe', {
                data: { name: 'ackprobe' },
                async execute(current) {
                    if (mode === 'deferred') current.deferred = true;
                    if (mode === 'replied') current.replied = true;
                    throw new Error(`boom ${TOKEN}`);
                },
            });
            const logs = await withLogs(() => events.execute(interaction, { commands }));
            return { calls, logs };
        }

        const fresh = await run('fresh');
        assert.equal(fresh.calls[0][0], 'reply');
        assert.equal(fresh.calls[0][1].content, GENERIC);
        assert.equal(ephemeralBits(fresh.calls[0][1]), true);
        mentionsClosed(fresh.calls[0][1]);
        assert.equal(fresh.logs.length, 1);
        assert.match(fresh.logs[0], /boom/);
        assert.equal(fresh.logs[0].includes(TOKEN), false);
        assert.match(fresh.logs[0], /\[redacted-token\]/);

        const deferred = await run('deferred');
        assert.equal(deferred.calls[0][0], 'edit');
        assert.equal(deferred.calls[0][1].content, GENERIC);
        assert.equal(deferred.calls[0][1].flags, undefined);
        mentionsClosed(deferred.calls[0][1]);

        const replied = await run('replied');
        assert.equal(replied.calls[0][0], 'follow');
        assert.equal(ephemeralBits(replied.calls[0][1]), true);

        for (const code of [10062, 40060]) {
            const quiet = await run('deferred', Object.assign(new Error(`DiscordAPIError[${code}]`), { code }));
            assert.equal(quiet.logs.length, 1);
            assert.equal(quiet.logs[0].includes(String(code)), false);
            assert.equal(quiet.logs[0].includes(TOKEN), false);
        }

        const loud = await run('fresh', Object.assign(new Error('socket down'), { code: 500 }));
        assert.equal(loud.logs.length, 2);
        assert.match(loud.logs[1], /socket down/);
    });

    it('defers /search before lookup and edits a direct hit', async () => {
        const bag = track({ commandName: 'search', strings: { query: '1' } });
        await search.execute(bag.interaction, null, {
            planSearch: async () => {
                bag.order.push('fetch');
                return { type: 'direct', media: bebop };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.edits.length, 1);
        assert.equal(bag.follows.length, 0);
        assert.equal(bag.edits[0].embeds[0].data.title, 'Cowboy Bebop');
        mentionsClosed(bag.edits[0]);
    });

    it('keeps a search miss ephemeral after the public defer', async () => {
        const bag = track({ commandName: 'search', strings: { query: 'nope' } });
        await search.execute(bag.interaction, null, {
            planSearch: async () => {
                bag.order.push('fetch');
                return { type: 'none' };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.follows[0].content, 'No anime matched that.');
        assert.equal(ephemeralBits(bag.follows[0]), true);
    });

    it('defers /randomanime before the roll', async () => {
        const bag = track({ commandName: 'randomanime', strings: { genre: 'Mecha' } });
        await randomanime.execute(bag.interaction, null, {
            peekGenres: async () => {
                bag.order.push('fetch');
                return ['Mecha'];
            },
            peekTags: async () => ['Isekai'],
            randomAnime: async () => ({ ok: true, media: { ...bebop, cached: false } }),
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.edits.length, 1);
        assert.equal(bag.edits[0].embeds[0].data.title, 'Cowboy Bebop');
    });

    it('answers randomanime autocomplete from the curated list when the peek hangs', async () => {
        const bag = track({
            commandName: 'randomanime',
            focusName: 'genre',
            focused: 'me',
            createdTimestamp: Date.now() - 2460,
        });
        const started = Date.now();
        await whileAlive(() => randomanime.autocomplete(bag.interaction, {
            peekGenres: () => new Promise(() => {}),
        }));
        assert.ok(Date.now() - started < 500);
        assert.ok(bag.responded[0].some((choice) => choice.name === 'Mecha'));
        assert.deepEqual(
            bag.responded[0],
            filterChoices(ANILIST_GENRES, 'me'),
        );
    });

    it('defers /meme before the fetch and edits the embed', async () => {
        const bag = track({ commandName: 'meme' });
        await meme.execute(bag.interaction, null, {
            loadMeme: async () => {
                bag.order.push('fetch');
                return {
                    title: 'A meme',
                    postLink: 'https://example.com/post',
                    url: 'https://example.com/meme.png',
                    subreddit: 'animememes',
                    author: 'reno',
                };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.edits[0].embeds[0].data.title, 'A meme');
        mentionsClosed(bag.edits[0]);
    });

    it('keeps a meme failure ephemeral and does not log the response body', async () => {
        const bag = track({ commandName: 'meme' });
        const logs = await withLogs(() => meme.execute(bag.interaction, null, {
            loadMeme: async () => {
                bag.order.push('fetch');
                throw new Error(`HTTP 500 secret-body ${TOKEN}`);
            },
        }));
        assertDeferredBeforeWork(bag);
        assert.equal(bag.follows[0].content, meme.MEME_ERROR);
        assert.equal(ephemeralBits(bag.follows[0]), true);
        assert.equal(logs.join('\n').includes(TOKEN), false);
        assert.equal(logs.join('\n').includes('secret-body'), false);
        assert.match(logs.join('\n'), /Anime meme reply failed/);
    });

    it('defers /profile before the link read, and keeps a missing link private', async () => {
        const missing = track({ commandName: 'profile' });
        await profile.execute(missing.interaction, null, {
            getLink: async () => {
                missing.order.push('fetch');
                return null;
            },
        });
        assertDeferredBeforeWork(missing);
        assert.match(missing.follows[0].content, /Link an account first/);
        assert.equal(ephemeralBits(missing.follows[0]), true);

        const shown = track({ commandName: 'profile' });
        await profile.execute(shown.interaction, null, {
            getLink: async () => {
                shown.order.push('fetch');
                return { anilist: { id: '9', name: 'Reno' } };
            },
            fetchProfile: async () => ({
                ok: true,
                profile: {
                    site: 'anilist', name: 'Reno', url: 'https://anilist.co/user/Reno', about: 'hi',
                    stats: { count: 1, episodes: 12, days: 0.2, meanScore: 8, statuses: {} },
                    genres: [], watching: [], completed: [], favorites: { anime: [], characters: [], staff: [], studios: [] },
                },
            }),
        });
        assertDeferredBeforeWork(shown);
        assert.equal(shown.edits[0].embeds[0].data.title.includes('anime profile'), true);
        assert.equal(ephemeralBits(shown.edits[0]), false);
    });

    it('defers /profile for another member and refuses people outside the server', async () => {
        const outsider = track({ commandName: 'profile', user: { id: TARGET, username: 'alex' }, targetMember: null });
        await profile.execute(outsider.interaction, null, { getLink: async () => { throw new Error('should not read'); } });
        assert.equal(outsider.order[0], 'defer');
        assert.match(outsider.follows[0].content, /isn't in this server/);
    });

    it('defers /link privately before saving a code', async () => {
        const bag = track({ commandName: 'link', sub: 'anilist', strings: { username: 'Reno' } });
        await link.execute(bag.interaction, null, {
            startLink: async (userId, site, name) => {
                bag.order.push('fetch');
                return { ok: true, site, username: name, code: 'mika-ABCDEFGH', expiresAt: new Date(Date.now() + 60000) };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.equal(bag.interaction.ephemeral, true);
        assert.match(JSON.stringify(bag.edits[0].embeds[0].data), /mika-ABCDEFGH/);
    });

    it('defers /findprofile before the lookup', async () => {
        const bag = track({ commandName: 'findprofile', strings: { site: 'anilist', username: 'Nobody' } });
        await findprofile.execute(bag.interaction, null, {
            lookupProfile: async () => {
                bag.order.push('fetch');
                return { ok: false, reason: 'noUser' };
            },
        });
        assertDeferredBeforeWork(bag);
        assert.match(bag.follows[0].content, /No public AniList profile is named/);
        assert.equal(ephemeralBits(bag.follows[0]), true);
    });

    it('defers /status before the shard broadcast', async () => {
        const bag = track({
            commandName: 'status',
            guild: {
                id: GUILD,
                name: 'Guild',
                shard: { id: 0 },
            },
        });
        bag.interaction.client = {
            shard: {
                count: 1,
                fetchClientValues: async () => {
                    bag.order.push('fetch');
                    return [2];
                },
                broadcastEval: async () => [4],
            },
            uptime: 1000,
            channels: { cache: { size: 3 } },
            ws: { ping: 12 },
        };
        await status.execute(bag.interaction);
        assertDeferredBeforeWork(bag);
        assert.equal(bag.edits[0].embeds[0].data.title, 'Mika status');
        mentionsClosed(bag.edits[0]);
    });

    it('defers /serverstats before fetching the owner', async () => {
        const { ChannelType } = require('discord.js');
        const bag = track({
            commandName: 'serverstats',
            guild: {
                id: GUILD,
                name: 'Guild',
                premiumSubscriptionCount: 1,
                preferredLocale: 'en-US',
                createdAt: new Date('2020-01-01T00:00:00Z'),
                memberCount: 10,
                verificationLevel: 1,
                iconURL: () => 'https://cdn.example/icon.png',
                fetchOwner: async () => {
                    bag.order.push('fetch');
                    return { id: USER, toString: () => 'Owner' };
                },
                roles: { cache: { size: 2 } },
                emojis: { cache: { size: 0 } },
                channels: { cache: { filter: (fn) => ({ size: fn({ type: ChannelType.GuildText }) ? 1 : 0 }) } },
            },
        });
        await serverstats.execute(bag.interaction);
        assertDeferredBeforeWork(bag);
        assert.equal(bag.edits[0].embeds[0].data.title, 'Guild');
        mentionsClosed(bag.edits[0]);
    });

    it('defers /config privately before the guild document', async () => {
        const panel = track({ commandName: 'config' });
        await openHub(panel.interaction, 'welcome', {
            loadConfig: async () => {
                panel.order.push('fetch');
                return {};
            },
        });
        assertDeferredBeforeWork(panel);
        assert.equal(panel.interaction.ephemeral, true);
        assert.equal(panel.edits.length, 1);
    });

    it('defers moderation commands before Discord or Mongo work', async () => {
        const target = rankedMember(TARGET, 10);
        const me = rankedMember(BOT, 50);
        const guild = {
            id: GUILD,
            ownerId: USER,
            name: 'Guild',
            members: { me, unban: async () => { throw new Error('unban down'); } },
            roles: { cache: { get: () => null, size: 1 } },
        };
        const base = {
            guild,
            member: rankedMember(USER, 1),
            targetMember: target,
            strings: { reason: 'spam', messages: '0', id: TARGET, type: 'kick' },
            ints: { amount: 5, id: 1 },
        };

        async function run(command, name, prepare) {
            const bag = track({ ...base, commandName: name });
            const logs = await withLogs(async () => {
                const deps = await prepare(bag) || {};
                await command.execute(bag.interaction, null, deps);
            });
            assert.equal(bag.order[0], 'defer', name);
            assert.ok(bag.order.includes('fetch'), name);
            assert.ok(bag.order.indexOf('defer') < bag.order.indexOf('fetch'), name);
            assert.equal(bag.order.includes('reply'), false, name);
            assert.equal(logs.join('\n').includes(TOKEN), false, name);
            return bag;
        }

        const originalPushWarn = mod.pushWarn;
        const originalFind = mod.findByMember;
        const originalInfra = mod.infractionsDB.findOne;
        const originalWarns = mod.warnDB.findOne;
        try {
            await run(ban, 'ban', (bag) => {
                bag.interaction.options.getMember = () => ({
                    ...target,
                    ban: async () => {
                        bag.order.push('fetch');
                        throw new Error('ban down');
                    },
                });
            });
            await run(kick, 'kick', (bag) => {
                bag.interaction.options.getMember = () => ({
                    ...target,
                    kick: async () => {
                        bag.order.push('fetch');
                        throw new Error('kick down');
                    },
                });
            });
            mod.pushWarn = async () => {
                throw new Error('warn down');
            };
            await run(warn, 'warn', (bag) => {
                const warnUser = {
                    ...target,
                };
                bag.interaction.options.getMember = () => warnUser;
                mod.pushWarn = async () => {
                    bag.order.push('fetch');
                    throw new Error('warn down');
                };
            });
            await run(clear, 'clear', () => {});
            await run(mute, 'mute', (bag) => ({
                getGuildConfig: async () => {
                    bag.order.push('fetch');
                    return { Muterole: [] };
                },
            }));
            await run(unmute, 'unmute', (bag) => ({
                getGuildConfig: async () => {
                    bag.order.push('fetch');
                    return { Muterole: [] };
                },
            }));
            await run(unban, 'unban', (bag) => {
                bag.interaction.guild = {
                    ...guild,
                    members: {
                        me,
                        unban: async () => {
                            bag.order.push('fetch');
                            throw new Error('unban down');
                        },
                    },
                };
            });
            await run(infractions, 'infractions', (bag) => {
                mod.infractionsDB.findOne = async () => {
                    bag.order.push('fetch');
                    return null;
                };
            });
            await run(clearinfractions, 'clearinfractions', (bag) => {
                mod.infractionsDB.findOne = async () => {
                    bag.order.push('fetch');
                    return null;
                };
                mod.warnDB.findOne = async () => null;
            });
            await run(clearwarns, 'clearwarns', (bag) => {
                mod.warnDB.findOne = async () => {
                    bag.order.push('fetch');
                    return null;
                };
            });
            await run(removeinfraction, 'removeinfraction', (bag) => {
                mod.findByMember = async () => {
                    bag.order.push('fetch');
                    return null;
                };
            });
            await run(unwarn, 'unwarn', (bag) => {
                bag.interaction.options.getInteger = () => null;
                mod.findByMember = async () => {
                    bag.order.push('fetch');
                    return { Content: [] };
                };
            });
        } finally {
            mod.pushWarn = originalPushWarn;
            mod.findByMember = originalFind;
            mod.infractionsDB.findOne = originalInfra;
            mod.warnDB.findOne = originalWarns;
        }
    });
});
