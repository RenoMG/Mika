const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    cleanDetails,
    cleanNotes,
    cleanScore,
    fuzzyDate,
    parseDateText,
    progressText,
    scoreText,
} = require('../src/anime/details');
const {
    STATUSES,
    editEntry,
    findEntry,
    libraryChoices,
    libraryLines,
    readAll,
    removeEntry,
    setStatus,
} = require('../src/anime/library');
const { computeStats, statsEmbed, statsSummary } = require('../src/anime/stats');
const {
    MAX_LISTS,
    addToList,
    applyCustomLists,
    cleanListName,
    createList,
    deleteList,
    readCustomLists,
    removeFromList,
    renameList,
} = require('../src/anime/customLists');
const { addEntity, applyEntities, readEntities, removeEntity, MAX_ENTITIES } = require('../src/anime/favorites');
const { addWatching, readWatching } = require('../src/anime/watching');
const { addCompleted } = require('../src/anime/completed');

function show(id, title, extra = {}) {
    return { id, titles: { english: title }, ...extra };
}

function empty() {
    return { watching: '', watchingList: [], completedList: [] };
}

test('details keep only valid, in-range values and strip unsafe text', () => {
    const now = Date.UTC(2026, 0, 1);
    const out = cleanDetails({
        progress: 40,
        episodes: 12,
        score: 8.46,
        notes: 'Great <@123456789012345678> show https://evil.example **bold** @everyone\nline two',
        startedAt: '2024-05-01',
        completedAt: '2999-01-01',
        rewatches: -1,
        duration: 'abc',
        format: 'tv',
        genres: ['Action', 'Action', '<#123456789012345678>', 'x'.repeat(100)],
        year: 1800,
        anilistId: 'should not copy',
        $set: { admin: true },
        __proto__: { polluted: true },
    }, now);
    assert.equal(out.progress, 12, 'progress is capped at the episode count');
    assert.equal(out.episodes, 12);
    assert.equal(out.score, 8.5);
    assert.equal(out.notes.includes('<@'), false);
    assert.equal(out.notes.includes('http'), false);
    assert.equal(out.notes.includes('*'), false);
    assert.equal(out.notes.includes('@everyone'), false);
    assert.equal(out.notes.includes('\n'), false);
    assert.equal(out.startedAt.toISOString(), '2024-05-01T00:00:00.000Z');
    assert.equal(out.completedAt, undefined, 'far-future dates are dropped');
    assert.equal(out.rewatches, undefined);
    assert.equal(out.duration, undefined);
    assert.equal(out.format, 'TV');
    assert.deepEqual(out.genres.slice(0, 2), ['Action', 'channel']);
    assert.equal(out.genres[2].length, 40);
    assert.equal(out.year, undefined);
    assert.equal('anilistId' in out, false);
    assert.equal('$set' in out, false);
    assert.equal(out.polluted, undefined);

    assert.equal(cleanScore(0), null);
    assert.equal(cleanScore(10.01), null);
    assert.equal(cleanScore('7'), 7);
    assert.equal(cleanScore(true), null);
    assert.equal(scoreText(9), '9');
    assert.equal(scoreText(9.5), '9.5');
    assert.equal(cleanNotes('a'.repeat(1000)).length, 300);
    assert.equal(fuzzyDate({ year: 2023, month: 2, day: 30 }), null, 'invalid calendar dates are rejected');
    assert.equal(fuzzyDate({ year: 2023 }).toISOString(), '2023-01-01T00:00:00.000Z');
    assert.equal(parseDateText('2024-07').toISOString(), '2024-07-01T00:00:00.000Z');
    assert.equal(parseDateText('July 2024'), null);
    assert.equal(progressText({ progress: 3, episodes: 12 }), '3/12');
    assert.equal(progressText({ progress: 3 }), 'ep 3');
    assert.equal(progressText({}), '');
});

test('older rows keep their exact shape when lists are rewritten', () => {
    const doc = { watchingList: [{ anilistId: '1', title: 'Old', recommended: false, fromUserId: '' }] };
    const added = addWatching(doc, show('2', 'New', { episodes: 24, duration: 23, genres: ['Drama'], format: 'TV' }));
    assert.deepEqual(Object.keys(added.list[0]).sort(), ['anilistId', 'fromUserId', 'recommended', 'title']);
    assert.equal(added.list[1].episodes, 24);
    assert.equal(added.list[1].duration, 23);
    assert.deepEqual(added.list[1].genres, ['Drama']);
});

test('a show moves through every status, keeping its details', () => {
    const doc = empty();
    const now = new Date('2025-01-01T00:00:00Z');
    let result = setStatus(doc, show('1', 'Frieren', { episodes: 28 }), 'planning', { now });
    assert.equal(result.ok, true);
    assert.equal(doc.planningList.length, 1);
    assert.equal(setStatus(doc, { id: '1' }, 'planning').reason, 'same');

    result = setStatus(doc, { id: '1' }, 'watching', { now });
    assert.equal(result.from, 'planning');
    assert.equal(doc.planningList.length, 0);
    assert.equal(readWatching(doc)[0].startedAt.getTime(), now.getTime());

    result = editEntry(doc, '1', { addProgress: 3, score: 8 });
    assert.equal(result.ok, true);
    assert.equal(result.entry.progress, 3);
    assert.equal(editEntry(doc, '1', { addProgress: -10 }).entry.progress, undefined, 'progress never goes below zero');
    editEntry(doc, '1', { progress: 5, notes: 'Love <@&123456789012345678> it' });
    assert.equal(findEntry(doc, '1').entry.notes, 'Love role it');

    result = setStatus(doc, { id: '1' }, 'paused');
    assert.equal(findEntry(doc, '1').status, 'paused');
    assert.equal(findEntry(doc, '1').entry.progress, 5);
    assert.equal(findEntry(doc, '1').entry.score, 8);

    setStatus(doc, { id: '1' }, 'watching');
    result = editEntry(doc, '1', { progress: 28 });
    assert.equal(result.finished, true, 'the last episode finishes the show');
    assert.equal(result.status, 'completed');
    assert.equal(readWatching(doc).length, 0);
    assert.equal(doc.completedList[0].progress, 28);

    setStatus(doc, { id: '1' }, 'rewatching');
    assert.equal(findEntry(doc, '1').entry.progress, undefined);
    result = editEntry(doc, '1', { progress: 28 });
    assert.equal(result.status, 'completed');
    assert.equal(findEntry(doc, '1').entry.rewatches, 1);

    setStatus(doc, { id: '1' }, 'dropped');
    assert.equal(findEntry(doc, '1').status, 'dropped');
    const counts = Object.fromEntries(Object.entries(readAll(doc)).map(([key, list]) => [key, list.length]));
    assert.deepEqual(counts, { watching: 0, planning: 0, completed: 0, rewatching: 0, paused: 0, dropped: 1 });
    assert.equal(removeEntry(doc, 'Frieren').ok, true);
    assert.equal(findEntry(doc, '1'), null);
});

test('edits reject bad values and clear with 0 or -', () => {
    const doc = empty();
    setStatus(doc, show('3', 'Bebop', { episodes: 26 }), 'completed');
    assert.equal(editEntry(doc, '3', { score: 11 }).reason, 'score');
    assert.equal(editEntry(doc, '3', { rewatches: 5000 }).reason, 'rewatches');
    assert.equal(editEntry(doc, '3', {}).reason, 'nothing');
    assert.equal(editEntry(doc, '404', { score: 5 }).reason, 'missing');
    editEntry(doc, '3', { score: 9.5, notes: 'keep' });
    assert.equal(findEntry(doc, '3').entry.score, 9.5);
    editEntry(doc, '3', { score: 0, notes: '-' });
    assert.equal(findEntry(doc, '3').entry.score, undefined);
    assert.equal(findEntry(doc, '3').entry.notes, undefined);
});

test('lists respect each status cap', () => {
    const doc = empty();
    const paused = STATUSES.find((status) => status.id === 'paused');
    doc.pausedList = Array.from({ length: paused.max }, (_, index) => ({ anilistId: String(index + 1), title: `P${index}` }));
    const full = setStatus(doc, show('99999', 'Extra'), 'paused');
    assert.equal(full.ok, false);
    assert.equal(full.reason, 'full');
});

test('views sort by score, title, and progress, and choices search every list', () => {
    const doc = empty();
    setStatus(doc, show('1', 'Bravo'), 'completed');
    setStatus(doc, show('2', 'Alpha'), 'completed');
    setStatus(doc, show('3', 'Charlie', { episodes: 10 }), 'watching');
    editEntry(doc, '1', { score: 6 });
    editEntry(doc, '2', { score: 9 });
    editEntry(doc, '3', { progress: 4 });
    assert.deepEqual(libraryLines(doc, 'completed', 'score'), ['• Alpha · ★9', '• Bravo · ★6']);
    assert.deepEqual(libraryLines(doc, 'completed', 'title'), ['• Alpha · ★9', '• Bravo · ★6']);
    const all = libraryLines(doc, 'all', 'progress');
    assert.equal(all[0], '📺 Charlie · 4/10');
    assert.equal(all.length, 3);
    assert.deepEqual(libraryChoices(doc, 'alp').map((choice) => choice.value), ['2']);
    assert.equal(libraryChoices(doc, '', { statuses: ['watching'] }).length, 1);
});

test('stats count episodes, time, and scores across statuses', () => {
    const doc = empty();
    setStatus(doc, show('1', 'A', { episodes: 12, duration: 24, genres: ['Action'], format: 'TV' }), 'completed');
    editEntry(doc, '1', { score: 8, rewatches: 1 });
    setStatus(doc, show('2', 'B', { episodes: 24, duration: 25, genres: ['Action', 'Drama'], format: 'TV' }), 'watching');
    editEntry(doc, '2', { progress: 10 });
    setStatus(doc, show('3', 'C', { episodes: 1, duration: 120, genres: ['Drama'], format: 'MOVIE' }), 'planning');
    const stats = computeStats(doc);
    assert.equal(stats.total, 3);
    assert.equal(stats.episodes, 24 + 10);
    assert.equal(stats.minutes, (24 * 24) + (10 * 25));
    assert.equal(stats.meanScore, 8);
    assert.equal(stats.distribution[7], 1);
    assert.deepEqual(stats.topGenres[0], ['Action', 2]);
    assert.equal(stats.topGenres.some(([genre, count]) => genre === 'Drama' && count === 1), true, 'planned shows do not count toward genres');
    assert.match(statsSummary(stats), /3 shows · 34 eps · 0\.6 days · ★8 avg/);
    const embed = statsEmbed(doc, { username: 'reno <@123456789012345678>' }).toJSON();
    assert.equal(embed.title.includes('<@'), false);
    assert.equal(computeStats(empty()).total, 0);
});

test('custom lists clean names, keep caps, and edit by id or name', () => {
    const doc = { customLists: [] };
    assert.equal(cleanListName('**Comfort** <@123456789012345678>'), 'Comfort user');
    assert.equal(createList(doc, '   ').ok, false);
    let result = createList(doc, 'Comfort shows');
    assert.equal(result.ok, true);
    applyCustomLists(doc, result.lists);
    assert.equal(createList(doc, 'comfort SHOWS').reason, 'duplicate');
    const id = readCustomLists(doc)[0].id;
    assert.match(id, /^[a-f0-9]{8}$/);
    result = addToList(doc, id, show('5', 'K-On!'));
    applyCustomLists(doc, result.lists);
    assert.equal(addToList(doc, 'Comfort shows', show('5', 'K-On!')).reason, 'duplicate');
    result = renameList(doc, id, 'Cozy');
    applyCustomLists(doc, result.lists);
    assert.equal(readCustomLists(doc)[0].name, 'Cozy');
    result = removeFromList(doc, 'Cozy', 'K-On!');
    applyCustomLists(doc, result.lists);
    assert.equal(readCustomLists(doc)[0].entries.length, 0);
    for (let index = 1; index < MAX_LISTS; index += 1) {
        result = createList(doc, `List ${index}`);
        applyCustomLists(doc, result.lists);
    }
    assert.equal(createList(doc, 'One too many').reason, 'full');
    result = deleteList(doc, 'Cozy');
    applyCustomLists(doc, result.lists);
    assert.equal(readCustomLists(doc).length, MAX_LISTS - 1);
    // Stored rows with a bad id or a dirty name are skipped on read.
    applyCustomLists(doc, [{ id: '../../x', name: 'Bad' }, { id: 'abcdef12', name: '' }]);
    assert.equal(readCustomLists(doc).length, 0);
});

test('favorite characters, staff, and studios are capped and cleaned', () => {
    const doc = {};
    let result = addEntity(doc, 'character', { id: '40', name: 'Spike <@123456789012345678> @here' });
    assert.equal(result.ok, true);
    applyEntities(doc, 'character', result.list);
    assert.equal(readEntities(doc, 'character')[0].name, 'Spike user here');
    assert.equal(addEntity(doc, 'character', { id: '40', name: 'Spike' }).reason, 'duplicate');
    assert.equal(addEntity(doc, 'character', { id: 'x', name: 'Bad' }).reason, 'missing');
    assert.equal(addEntity(doc, 'villain', { id: '1', name: 'Nope' }).ok, false);
    const many = Array.from({ length: MAX_ENTITIES }, (_, index) => ({ id: String(index + 100), name: `S${index}` }));
    applyEntities(doc, 'studio', many);
    assert.equal(addEntity(doc, 'studio', { id: '1', name: 'More' }).reason, 'full');
    result = removeEntity(doc, 'studio', 'S0');
    assert.equal(result.ok, true);
    assert.equal(result.list.length, MAX_ENTITIES - 1);
});

test('completing from search keeps the show facts and fills progress', () => {
    const doc = empty();
    const result = addCompleted(doc, show('8', 'Mushishi', { episodes: 26, duration: 25, genres: ['Mystery'] }));
    assert.equal(result.completed[0].progress, 26);
    assert.equal(result.completed[0].duration, 25);
    assert.equal(result.anilistId, '8');
});
