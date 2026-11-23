const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
    AUTOCOMPLETE_BUDGET_MS,
    MEMORY_MAX,
    MEMORY_TTL_MS,
    animeAutocomplete,
    noteAutocompleteError,
    remainingBudget,
    resetAutocomplete,
} = require('../src/anime/autocomplete');
const { planSearch } = require('../src/commands/anime/search');
const interactionCreate = require('../src/events/interactionCreate');

function interaction(id, userId, commandName, respond, createdTimestamp, text = 'cowboy bebop', optionName = 'query') {
    return {
        id,
        commandName,
        user: { id: userId },
        createdTimestamp,
        options: {
            getFocused: (full) => (full ? { name: optionName, value: text } : text),
        },
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

test('a slow lookup answers from the longest cached prefix and the fetch still finishes', async () => {
    resetAutocomplete();
    const now = 5_000_000;
    await animeAutocomplete(interaction('slow-seed', '1001', 'favorite', async () => {}, now, 'cowboy'), {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: async () => [media('4', 'Cowboy Bebop')],
    });
    let finished = false;
    const rows = [];
    await animeAutocomplete(interaction('slow-1', '1001', 'favorite', async (choices) => {
        rows.push(choices);
    }, now - (AUTOCOMPLETE_BUDGET_MS - 80)), {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: () => new Promise((resolve) => {
            setTimeout(() => {
                finished = true;
                resolve([media('4', 'Late Show')]);
            }, 400);
        }),
    });
    assert.equal(finished, false);
    assert.deepEqual(rows, [[{ name: 'Cowboy Bebop', value: '4' }]]);
    await new Promise((resolve) => setTimeout(resolve, 450));
    assert.equal(finished, true);
});

test('a limiter wait that would miss the deadline does not start a fetch', async () => {
    resetAutocomplete();
    const now = 8_000;
    await animeAutocomplete(interaction('queue-seed', '1002', 'search', async () => {}, now, 'cowboy'), {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: async () => [media('1', 'Cowboy Bebop')],
    });
    const rows = [];
    let called = false;
    await animeAutocomplete(interaction('queue-1', '1002', 'search', async (choices) => {
        rows.push(choices);
    }, now), {
        now: () => now,
        peek: () => null,
        waitMs: () => 9000,
        search: () => {
            called = true;
            return new Promise(() => {});
        },
    });
    assert.equal(called, false);
    assert.deepEqual(rows, [[{ name: 'Cowboy Bebop', value: '1' }]]);
});

test('an older keystroke does not start a fetch', async () => {
    resetAutocomplete();
    const now = 12_000;
    const calls = [];
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const deps = {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: (text) => {
            calls.push(text);
            return gate;
        },
    };
    const older = animeAutocomplete(interaction('type-na', '1004', 'favorite', async () => {}, now, 'na'), deps);
    const newer = animeAutocomplete(interaction('type-nar', '1004', 'favorite', async (choices) => {
        calls.push(['answered', choices]);
    }, now, 'nar'), deps);
    release([media('9', 'Naruto')]);
    await Promise.all([older, newer]);
    assert.deepEqual(calls, ['nar', ['answered', [{ name: 'Naruto', value: '9' }]]]);
});

test('a Kitsu-only list and an empty filtered list are not autocomplete hits', async () => {
    resetAutocomplete();
    const now = 13_000;
    const calls = [];
    const rows = [];
    await animeAutocomplete(interaction('kitsu-hit', '1008', 'search', async (choices) => {
        rows.push(choices);
    }, now, 'visible'), {
        now: () => now,
        peek: async () => [{ id: 'kitsu:2', titles: { english: 'Visible' } }],
        waitMs: () => 0,
        coalesceMs: 0,
        search: async (text) => {
            calls.push(text);
            return [media('5', 'Visible')];
        },
    });
    assert.deepEqual(calls, ['visible']);
    assert.deepEqual(rows, [[{ name: 'Visible', value: '5' }]]);

    resetAutocomplete();
    const emptyRows = [];
    let searches = 0;
    await animeAutocomplete(interaction('empty-filter', '1008', 'search', async (choices) => {
        emptyRows.push(choices);
    }, now, 'planetes'), {
        now: () => now,
        peek: async () => [{ id: 'nope', titles: { english: '' } }, { id: 'kitsu:9', titles: { english: 'Planetes' } }],
        waitMs: () => 0,
        coalesceMs: 0,
        search: async () => {
            searches += 1;
            return [];
        },
    });
    assert.equal(searches, 1);
    assert.deepEqual(emptyRows, [[]]);
});

test('autocomplete memory expires and drops the oldest past the cap', async () => {
    resetAutocomplete();
    let now = 20_000;
    const deps = {
        now: () => now,
        peek: () => null,
        waitMs: () => 0,
        coalesceMs: 0,
        search: async () => [media('1', 'Show')],
    };
    await animeAutocomplete(interaction('mem-1', '3', 'search', async () => {}, now, 'aa'), deps);
    now += MEMORY_TTL_MS + 1;
    const rows = [];
    let searches = 0;
    await animeAutocomplete(interaction('mem-2', '3', 'search', async (choices) => {
        rows.push(choices);
    }, now, 'aa'), {
        ...deps,
        search: async () => {
            searches += 1;
            return [media('2', 'Other')];
        },
    });
    assert.equal(searches, 1);
    assert.deepEqual(rows, [[{ name: 'Other', value: '2' }]]);

    resetAutocomplete();
    now = 40_000;
    for (let index = 0; index < MEMORY_MAX + 1; index += 1) {
        const text = `q${String(index).padStart(2, '0')}`;
        await animeAutocomplete(interaction(`cap-${index}`, '3', 'search', async () => {}, now, text), {
            ...deps,
            search: async () => [media(String(index + 1), `Show ${index}`)],
        });
    }
    let oldestSearches = 0;
    await animeAutocomplete(interaction('cap-old', '3', 'search', async () => {}, now, 'q00'), {
        ...deps,
        search: async () => {
            oldestSearches += 1;
            return [media('1', 'Show 0')];
        },
    });
    assert.equal(oldestSearches, 1);
});

test('timing logs stay off unless asked, and never include the query text', async () => {
    resetAutocomplete();
    const logs = [];
    const original = console.debug;
    console.debug = (line) => logs.push(String(line));
    const previousFlag = process.env.MIKA_AUTOCOMPLETE_TIMING;
    const previousLevel = process.env.LOG_LEVEL;
    try {
        delete process.env.MIKA_AUTOCOMPLETE_TIMING;
        delete process.env.LOG_LEVEL;
        await animeAutocomplete(interaction('quiet-log', '77', 'search', async () => {}, 30_000, 'secret query'), {
            now: () => 30_000,
            peek: () => [media('1', 'Secret Query')],
            waitMs: () => 0,
            coalesceMs: 0,
            search: async () => [],
        });
        assert.equal(logs.length, 0);

        resetAutocomplete();
        process.env.MIKA_AUTOCOMPLETE_TIMING = '1';
        await animeAutocomplete(interaction('loud-log', '77', 'search', async () => {}, 30_000, 'another title'), {
            now: () => 30_000,
            peek: () => null,
            waitMs: () => 0,
            coalesceMs: 0,
            search: async () => {
                throw Object.assign(new Error('DiscordAPIError[10062]'), { code: 10062 });
            },
        });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].includes('secret query'), false);
        assert.equal(logs[0].includes('another title'), false);
        assert.equal(logs[0].includes('secret'), false);
        const line = JSON.parse(logs[0]);
        assert.equal(line.queryLength, 'another title'.length);
        assert.equal(typeof line.queryHash, 'string');
        assert.equal(line.queryHash.length, 12);
        assert.equal(line.source, 'empty');
        assert.ok(line.code10062 >= 1);
        assert.equal(line.commandName, 'search');
    } finally {
        console.debug = original;
        if (previousFlag == null) delete process.env.MIKA_AUTOCOMPLETE_TIMING;
        else process.env.MIKA_AUTOCOMPLETE_TIMING = previousFlag;
        if (previousLevel == null) delete process.env.LOG_LEVEL;
        else process.env.LOG_LEVEL = previousLevel;
    }
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

        await animeAutocomplete(interaction('boom', '56', 'search', async () => {}, Date.now(), 'planetes'), {
            peek: () => null,
            waitMs: () => 0,
            coalesceMs: 0,
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
