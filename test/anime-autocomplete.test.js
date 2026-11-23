const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
    AUTOCOMPLETE_BUDGET_MS,
    animeAutocomplete,
    noteAutocompleteError,
    remainingBudget,
    resetAutocomplete,
} = require('../src/anime/autocomplete');
const { planSearch } = require('../src/commands/anime/search');
const interactionCreate = require('../src/events/interactionCreate');

function interaction(id, userId, commandName, respond, createdTimestamp) {
    return {
        id,
        commandName,
        user: { id: userId },
        createdTimestamp,
        options: { getFocused: () => 'cowboy bebop' },
        respond,
    };
}

function media(id, name) {
    return { id, titles: { english: name } };
}

test('the autocomplete budget is about 2.5s from createdTimestamp', () => {
    const now = 10_000;
    assert.equal(AUTOCOMPLETE_BUDGET_MS, 2500);
    assert.equal(remainingBudget({ createdTimestamp: now - 2400 }, () => now), 100);
    assert.equal(remainingBudget({ createdTimestamp: now - 9000 }, () => now), 0);
    assert.equal(remainingBudget({}, () => now), AUTOCOMPLETE_BUDGET_MS);
});

test('autocomplete answers from the search cache without fetching', async () => {
    resetAutocomplete();
    const rows = [];
    let searches = 0;
    await animeAutocomplete(interaction('cache-1', '1003', 'favorite', async (choices) => {
        rows.push(choices);
    }, 5_000_000), {
        now: () => 5_000_000,
        peek: () => [media('1', 'Cowboy Bebop')],
        waitMs: () => 9000,
        search: async () => {
            searches += 1;
            return [];
        },
    });
    assert.equal(searches, 0);
    assert.deepEqual(rows, [[{ name: 'Cowboy Bebop', value: '1' }]]);
});

test('a slow lookup answers before the deadline and the fetch still finishes', async () => {
    resetAutocomplete();
    const now = 5_000_000;
    let finished = false;
    const rows = [];
    await animeAutocomplete(interaction('slow-1', '1001', 'favorite', async (choices) => {
        rows.push(choices);
    }, now - (AUTOCOMPLETE_BUDGET_MS - 80)), {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        search: () => new Promise((resolve) => {
            setTimeout(() => {
                finished = true;
                resolve([media('4', 'Late Show')]);
            }, 400);
        }),
    });
    assert.equal(finished, false);
    assert.deepEqual(rows, [[]]);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(finished, true);
});

test('a limiter wait that would miss the deadline does not block the response', async () => {
    resetAutocomplete();
    const now = 8_000;
    const rows = [];
    let called = null;
    const hung = new Promise(() => {});
    await animeAutocomplete(interaction('queue-1', '1002', 'search', async (choices) => {
        rows.push(choices);
    }, now), {
        now: () => now,
        peek: () => null,
        waitMs: () => 9000,
        search: (text, options) => {
            called = { text, options };
            return hung;
        },
    });
    assert.deepEqual(rows, [[]]);
    assert.equal(called.text, 'cowboy bebop');
    assert.equal(called.options.maxWaitMs, AUTOCOMPLETE_BUDGET_MS);
});

test('a superseded autocomplete is not answered', async () => {
    resetAutocomplete();
    const now = 9_000;
    let resolveSearch;
    const pending = new Promise((resolve) => {
        resolveSearch = resolve;
    });
    const rows = [];
    const deps = {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        search: () => pending,
    };
    const first = animeAutocomplete(interaction('stale-old', '1004', 'favorite', async (choices) => {
        rows.push(['old', choices]);
    }, now), deps);
    const second = animeAutocomplete(interaction('stale-new', '1004', 'favorite', async (choices) => {
        rows.push(['new', choices]);
    }, now), deps);
    resolveSearch([media('9', 'Trigun')]);
    await Promise.all([first, second]);
    assert.deepEqual(rows, [['new', [{ name: 'Trigun', value: '9' }]]]);
});

test('autocomplete for two commands from the same person both answer', async () => {
    resetAutocomplete();
    const now = 11_000;
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const rows = [];
    const deps = {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        search: () => gate,
    };
    const favorite = animeAutocomplete(interaction('fav', '7', 'favorite', async () => {
        rows.push('favorite');
    }, now), deps);
    const recommend = animeAutocomplete(interaction('rec', '7', 'recommend', async () => {
        rows.push('recommend');
    }, now), deps);
    release([media('1', 'Cowboy Bebop')]);
    await Promise.all([favorite, recommend]);
    assert.deepEqual(rows.sort(), ['favorite', 'recommend']);
});

test('unknown interaction and already acknowledged are swallowed, other errors log once', async () => {
    resetAutocomplete();
    const logs = [];
    const original = console.error;
    console.error = (line) => logs.push(String(line));
    const secret = 'bbbbbbbbbbbbbbbbbbbb.CCCCC.dddddddddddddddddddd';
    try {
        for (const code of [10062, 40060]) {
            const error = new Error(`DiscordAPIError[${code}]`);
            error.code = code;
            await animeAutocomplete(interaction(`quiet-${code}`, '55', 'favorite', async () => {
                throw error;
            }, Date.now()), {
                peek: () => [media('1', 'Cowboy Bebop')],
                search: async () => [],
                waitMs: () => 0,
            });
        }
        assert.equal(logs.length, 0);

        await animeAutocomplete(interaction('boom', '56', 'search', async () => {}, Date.now()), {
            peek: () => null,
            waitMs: () => 0,
            search: async () => {
                throw new Error(`AniList down ${secret}`);
            },
        });
        assert.equal(logs.length, 1);
        assert.match(logs[0], /AniList down/);
        assert.equal(logs[0].includes(secret), false);

        const logged = noteAutocompleteError(Object.assign(new Error('missing access'), { code: 50001 }));
        assert.equal(logged, true);
        assert.equal(logs.length, 2);
        const quiet = noteAutocompleteError(Object.assign(new Error('unknown'), { code: 10062 }));
        assert.equal(quiet, false);
        assert.equal(logs.length, 2);
    } finally {
        console.error = original;
    }
});

test('interactionCreate swallows 10062 and logs a real autocomplete error once', async () => {
    const logs = [];
    const original = console.error;
    console.error = (line) => logs.push(String(line));
    try {
        const unknown = new Error('DiscordAPIError[10062]: Unknown interaction');
        unknown.code = 10062;
        await interactionCreate.execute({
            isButton: () => false,
            isAutocomplete: () => true,
            commandName: 'search',
            responded: false,
            respond: async () => {
                throw unknown;
            },
        }, {
            commands: new Map([['search', { autocomplete: async (interaction) => interaction.respond([]) }]]),
        });
        assert.equal(logs.length, 0);

        const acknowledged = Object.assign(new Error('already acknowledged'), { code: 40060 });
        await interactionCreate.execute({
            isButton: () => false,
            isAutocomplete: () => true,
            commandName: 'search',
            responded: false,
            respond: async () => {
                throw acknowledged;
            },
        }, {
            commands: new Map([['search', { autocomplete: async () => { throw new Error('boom'); } }]]),
        });
        assert.equal(logs.length, 1);
        assert.match(logs[0], /boom/);
        assert.equal(logs[0].includes('already acknowledged'), false);
    } finally {
        console.error = original;
    }
});

test('a picked AniList id opens that show and free text still searches', async () => {
    const option = require('../src/commands/anime/search').data.toJSON().options[0];
    assert.equal(option.autocomplete, true);
    assert.match(require('../src/anime/client').SEARCH_QUERY, /isAdult:\s*false/);
    assert.match(require('../src/anime/client').MEDIA_QUERY, /isAdult:\s*false/);

    let fetched;
    const direct = await planSearch('15', {
        getAnime: async (id) => {
            fetched = id;
            return media('15', 'Cowboy Bebop');
        },
        searchAnime: async () => {
            throw new Error('suggestion values skip text search');
        },
    });
    assert.equal(direct.type, 'direct');
    assert.equal(fetched, '15');

    const missing = await planSearch('99', {
        getAnime: async () => null,
        searchAnime: async () => {
            throw new Error('missing ids do not fall through to text search');
        },
    });
    assert.equal(missing.type, 'missing');

    let searched;
    const typed = await planSearch('cowboy bebop', {
        getAnime: async () => {
            throw new Error('free text is not an id lookup');
        },
        searchAnime: async (text) => {
            searched = text;
            return [media('1', 'Other'), media('2', 'Also')];
        },
    });
    assert.equal(typed.type, 'picker');
    assert.equal(searched, 'cowboy bebop');
    assert.equal(typed.results.length, 2);
});
