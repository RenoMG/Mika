const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    MAX_GENRES,
    PAGE_SIZE,
    TAG_ID,
    applyTaste,
    buildGenreRows,
    buildSearchRow,
    buildTasteRows,
    capTaste,
    genreSlice,
    mergeGenres,
} = require('../src/anime/components');
const { MENU_TIMEOUT_MS } = require('../src/anime/menu');

test('menus time out after two minutes', () => {
    assert.equal(MENU_TIMEOUT_MS, 120000);
    assert.equal(PAGE_SIZE, 25);
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

test('genre pages stay within 25 options and keep selections from other pages', () => {
    const all = Array.from({ length: 30 }, (_, index) => `Genre ${index}`);
    assert.equal(genreSlice(all, 0).names.length, 25);
    assert.equal(genreSlice(all, 1).names.length, 5);

    const first = buildGenreRows(all, 0, ['Genre 0', 'Genre 29']).map((row) => row.toJSON());
    const second = buildGenreRows(all, 1, ['Genre 29'], { disabled: true }).map((row) => row.toJSON());
    assert.equal(first[0].components[0].options.length, 25);
    assert.equal(first[1].components[0].disabled, true);
    assert.ok(!first[1].components[1].disabled);
    assert.equal(second[0].components[0].options.length, 5);
    assert.equal(second[0].components[0].disabled, true);
    assert.equal(second[1].components[0].disabled, true);
    assert.equal(second[1].components[1].disabled, true);

    const merged = mergeGenres(['Genre 29', 'Genre 0'], genreSlice(all, 0).names, ['Genre 1', 'Genre 2']);
    assert.deepEqual(merged.slice(0, 3), ['Genre 1', 'Genre 2', 'Genre 29']);
    assert.ok(merged.length <= MAX_GENRES);
});

test('genres and tags share one cap of 10', () => {
    const genres = Array.from({ length: 18 }, (_, index) => `Genre ${index}`);
    const tags = ['Isekai', 'Iyashikei', 'Super Power', 'Time Loop', 'School'];
    const open = buildTasteRows(genres, tags, { page: 0, genres: [], tags: [] }).map((row) => row.toJSON());
    assert.equal(open.length, 2);
    assert.equal(open[0].components[0].custom_id, 'genres:pick');
    assert.equal(open[1].components[0].custom_id, TAG_ID);
    assert.equal(open[1].components[0].max_values, 5);
    assert.equal(open[1].components[0].options.length, 5);

    const full = buildTasteRows(genres, tags, {
        page: 0,
        genres: genres.slice(0, 8),
        tags: ['Isekai', 'School'],
    }).map((row) => row.toJSON());
    assert.equal(full[0].components[0].max_values, 8);
    assert.equal(full[1].components[0].max_values, 2);

    const picked = applyTaste({
        genres: genres.slice(0, 8),
        tags: [],
    }, {
        customId: TAG_ID,
        pageNames: tags,
        picked: tags,
        genreNames: genres,
        tagNames: tags,
    });
    assert.equal(picked.genres.length, 8);
    assert.deepEqual(picked.tags, ['Isekai', 'Iyashikei']);
    assert.ok(picked.genres.length + picked.tags.length <= MAX_GENRES);

    const capped = capTaste([...genres, 'Extra'], ['Isekai', 'School', 'Idol']);
    assert.equal(capped.genres.length, MAX_GENRES);
    assert.deepEqual(capped.tags, []);

    const blocked = buildTasteRows(genres, tags, {
        page: 0,
        genres: genres.slice(0, MAX_GENRES),
        tags: [],
    }).map((row) => row.toJSON());
    assert.equal(blocked[1].components[0].disabled, true);
    assert.equal(blocked[1].components[0].placeholder, 'Remove one to add more');
});
