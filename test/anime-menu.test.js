const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildSearchRow } = require('../src/anime/components');
const { MENU_TIMEOUT_MS } = require('../src/anime/menu');

test('menus time out after two minutes', () => {
    assert.equal(MENU_TIMEOUT_MS, 120000);
});

test('search results stay within 10 options and can be disabled', () => {
    const results = Array.from({ length: 12 }, (_, index) => ({
        id: String(index + 1),
        titles: { english: `Show ${index}` },
        score: 80,
        genres: ['Action'],
        source: 'AniList',
    }));
    const live = buildSearchRow(results).map((row) => row.toJSON());
    const disabled = buildSearchRow(results, { disabled: true }).map((row) => row.toJSON());
    assert.equal(live[0].components[0].options.length, 10);
    assert.ok(!live[0].components[0].disabled);
    assert.equal(disabled[0].components[0].disabled, true);
    assert.equal(disabled[0].components[0].custom_id, 'anime:search');
});
