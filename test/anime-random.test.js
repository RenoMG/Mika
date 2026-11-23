const assert = require('node:assert/strict');
const { test } = require('node:test');
const { REROLL_ID, rerollRow } = require('../src/anime/components');
const {
    RANDOM_MIN_POPULARITY,
    RANDOM_MIN_SCORE,
    RANDOM_QUERY,
    buildRandomQuery,
    kitsuRandomUrl,
} = require('../src/anime/client');
const { MENU_TIMEOUT_MS } = require('../src/anime/menu');
const {
    ANILIST_GENRES,
    GENRE_CHOICE,
    TAG_CHOICE,
    filterChoices,
    resolveRandomFilters,
} = require('../src/anime/random');
const { visibilityFor } = require('../src/anime/profiles');

test('the random query is non-adult and keeps a score and popularity floor', () => {
    assert.match(RANDOM_QUERY, /type:\s*ANIME/);
    assert.match(RANDOM_QUERY, /isAdult:\s*false/);
    assert.match(RANDOM_QUERY, /sort:\s*\[POPULARITY_DESC\]/);
    assert.match(RANDOM_QUERY, new RegExp(`averageScore_greater:\\s*${RANDOM_MIN_SCORE - 1}`));
    assert.match(RANDOM_QUERY, new RegExp(`popularity_greater:\\s*${RANDOM_MIN_POPULARITY - 1}`));
    assert.equal(RANDOM_QUERY.toLowerCase().includes('hentai'), false);
    assert.equal(RANDOM_QUERY.toLowerCase().includes('jikan'), false);
    assert.ok(RANDOM_MIN_SCORE >= 70);
    assert.ok(RANDOM_MIN_POPULARITY >= 10000);

    const picked = buildRandomQuery({ page: 4, genres: ['Mecha', 'Hentai'], tags: ['Isekai', 'Isekai'] });
    assert.equal(picked.variables.page, 4);
    assert.deepEqual(picked.variables.genres, ['Mecha']);
    assert.deepEqual(picked.variables.tags, ['Isekai']);
    assert.match(picked.query, /isAdult:\s*false/);

    const open = buildRandomQuery({ page: 1, genres: [], tags: [] });
    assert.equal(open.variables.genres, null);
    assert.equal(open.variables.tags, null);

    const url = kitsuRandomUrl({ page: 3, genre: 'Slice of Life' });
    assert.equal(url.searchParams.get('filter[nsfw]'), 'false');
    assert.equal(url.searchParams.get('filter[categories]'), 'slice-of-life');
    assert.equal(url.searchParams.get('page[offset]'), '40');
    assert.equal(url.toString().toLowerCase().includes('r18'), false);
});

test('blank options use the profile, and a pick replaces it', () => {
    const profile = {
        genres: ['Mecha', 'Drama', 'Hentai', 'Mecha'],
        tags: ['Isekai', 'School'],
    };
    const fromProfile = resolveRandomFilters({ profile });
    assert.equal(fromProfile.source, 'profile');
    assert.deepEqual(fromProfile.genres, ['Mecha', 'Drama']);
    assert.deepEqual(fromProfile.tags, ['Isekai', 'School']);

    const empty = resolveRandomFilters({ profile: { genres: [], tags: [] } });
    assert.deepEqual(empty.genres, []);
    assert.deepEqual(empty.tags, []);
    assert.equal(empty.source, 'any');
    assert.equal(resolveRandomFilters({}).source, 'any');

    const choice = resolveRandomFilters({ profile, genre: 'comedy', tag: 'isekai' });
    assert.deepEqual(choice.genres, ['Comedy']);
    assert.deepEqual(choice.tags, ['Isekai']);
    assert.equal(choice.source, 'choice');

    const genreOnly = resolveRandomFilters({ profile, genre: 'Mecha' });
    assert.deepEqual(genreOnly.tags, []);
    assert.equal(resolveRandomFilters({ genre: 'Not A Genre' }).error, GENRE_CHOICE);
    assert.equal(resolveRandomFilters({ tag: 'Not A Tag' }).error, TAG_CHOICE);

    const many = resolveRandomFilters({
        profile: { genres: ANILIST_GENRES.concat(ANILIST_GENRES), tags: [] },
    });
    assert.equal(many.genres.length, 10);
    assert.equal(filterChoices(ANILIST_GENRES, 'me').some((choice) => choice.value === 'Mecha'), true);
    assert.equal(filterChoices(ANILIST_GENRES, 'hentai').length, 0);
});

test('reroll is invoker-only for two minutes and profile visibility follows the server', () => {
    assert.equal(MENU_TIMEOUT_MS, 120000);
    const live = rerollRow(false).toJSON().components[0];
    const disabled = rerollRow(true).toJSON().components[0];
    assert.equal(live.custom_id, REROLL_ID);
    assert.equal(live.label, 'Reroll');
    assert.equal(live.emoji.name, '🎲');
    assert.ok(!live.disabled);
    assert.equal(disabled.disabled, true);

    assert.equal(visibilityFor({ self: true, sameGuild: false, hasProfile: true, discoverable: false }).ephemeral, false);
    assert.equal(visibilityFor({ self: true, sameGuild: true, hasProfile: false, discoverable: false }).reason, 'setup');
    assert.equal(visibilityFor({ self: false, sameGuild: true, hasProfile: true, discoverable: false }).show, true);
    assert.equal(visibilityFor({ self: false, sameGuild: true, hasProfile: false, discoverable: false }).reason, 'missing');
    assert.equal(visibilityFor({ self: false, sameGuild: false, hasProfile: true, discoverable: false }).show, false);
    assert.equal(visibilityFor({ self: false, sameGuild: false, hasProfile: true, discoverable: true }).ephemeral, false);
});
