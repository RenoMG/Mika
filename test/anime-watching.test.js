const assert = require('node:assert/strict');
const { test } = require('node:test');
const { blocksForCommand, CATEGORY_ORDER } = require('../src/commands/help/menu/helpMenu');
const command = require('../src/commands/anime/watching');
const {
    MAX_WATCHING,
    addWatching,
    applyWatching,
    clearWatching,
    legacyWatching,
    readWatching,
    removeWatching,
    watchingLabel,
    watchingLines,
} = require('../src/anime/watching');

const SENDER = '100000000000000001';

function profile(extra = {}) {
    return {
        watching: '',
        watchingList: [],
        accepted: [],
        ...extra,
    };
}

function show(id, title) {
    return { id, titles: { english: title } };
}

test('add, remove, and clear stay inside ten and leave the legacy line alone', () => {
    const doc = profile({ watching: 'Old <@111111111111111111> note', accepted: [{ anilistId: '9', title: 'Keep' }] });
    assert.equal(readWatching(doc).length, 0);
    assert.equal(doc.watching, 'Old <@111111111111111111> note');
    assert.deepEqual(doc.watchingList, []);

    let list = [];
    for (let index = 1; index <= MAX_WATCHING; index += 1) {
        const added = addWatching({ ...doc, watchingList: list }, show(String(index), `Show ${index}`));
        assert.equal(added.ok, true);
        assert.equal(added.reason, 'added');
        list = added.list;
    }
    assert.equal(list.length, MAX_WATCHING);
    const full = addWatching({ watchingList: list }, show('11', 'Show 11'));
    assert.equal(full.ok, false);
    assert.equal(full.reason, 'full');
    assert.equal(full.list.length, MAX_WATCHING);

    const duplicate = addWatching({ watchingList: list }, show('1', 'Show 1'));
    assert.equal(duplicate.reason, 'duplicate');

    applyWatching(doc, list);
    assert.equal(doc.watching, 'Old <@111111111111111111> note');
    assert.equal(doc.accepted.length, 1);
    assert.equal(doc.watchingList[0].title.includes('💌'), false);
    assert.equal(doc.watchingList[0].recommended, false);

    const removed = removeWatching(doc, '3');
    assert.equal(removed.ok, true);
    assert.equal(removed.clearLegacy, false);
    assert.deepEqual(removed.list.map((item) => item.anilistId), ['1', '2', '4', '5', '6', '7', '8', '9', '10']);
    const byTitle = removeWatching({ watching: doc.watching, watchingList: removed.list }, 'Show 1');
    assert.equal(byTitle.removed.anilistId, '1');
    assert.equal(byTitle.clearLegacy, false);

    const cleared = clearWatching(doc);
    assert.equal(cleared.clearLegacy, false);
    assert.equal(cleared.legacy, 'Old user note');
    applyWatching(doc, cleared.list);
    assert.deepEqual(doc.watchingList, []);
    assert.equal(doc.watching, 'Old <@111111111111111111> note');
    assert.deepEqual(watchingLines(doc), ['Old user note']);
});

test('a legacy watching line is sanitized, removable, and not rewritten by a read', () => {
    const doc = profile({ watching: '**Cowboy Bebop** <@222222222222222222> @everyone' });
    assert.equal(legacyWatching(doc), 'Cowboy Bebop user everyone');
    assert.deepEqual(watchingLines(doc), ['Cowboy Bebop user everyone']);
    assert.equal(watchingLabel(doc), 'Cowboy Bebop user everyone');
    assert.equal(doc.watching.includes('**'), true);

    const removed = removeWatching(doc, 'legacy');
    assert.equal(removed.ok, true);
    assert.equal(removed.clearLegacy, true);
    assert.equal(removed.removed.legacy, true);
    applyWatching(doc, removed.list, { clearLegacy: true });
    assert.equal(doc.watching, '');
    assert.deepEqual(watchingLines(doc), []);
    assert.equal(removeWatching(doc, 'legacy').ok, false);
});

test('accepting a show marks it recommended without a second row or an emoji in the title', () => {
    const doc = profile({
        watching: 'Keep me',
        watchingList: [{ anilistId: '5', title: 'Trigun', recommended: false, fromUserId: '' }],
    });
    const marked = addWatching(doc, show('5', '💌 Trigun'), {
        recommended: true,
        fromUserId: SENDER,
    });
    assert.equal(marked.ok, true);
    assert.equal(marked.reason, 'marked');
    assert.equal(marked.list.length, 1);
    assert.equal(marked.list[0].title, 'Trigun');
    assert.equal(marked.list[0].title.includes('💌'), false);
    assert.equal(marked.list[0].recommended, true);
    assert.equal(marked.list[0].fromUserId, SENDER);
    applyWatching(doc, marked.list);
    assert.equal(doc.watching, 'Keep me');
    assert.equal(watchingLines(doc).join('\n'), '1. 💌 Trigun\nKeep me');

    const again = addWatching({ watchingList: marked.list }, show('5', 'Trigun'), {
        recommended: true,
        fromUserId: SENDER,
    });
    assert.equal(again.reason, 'duplicate');
    assert.equal(again.list.length, 1);
});

test('a full list still marks a show that is already on it', () => {
    let current = [];
    for (let index = 1; index <= MAX_WATCHING; index += 1) {
        const added = addWatching({ watchingList: current }, show(String(index), `Show ${index}`));
        current = added.list;
    }
    const doc = profile({ watching: 'Plain text', watchingList: current });
    const extra = addWatching(doc, show('99', 'Extra'), { recommended: true, fromUserId: SENDER });
    assert.equal(extra.reason, 'full');
    assert.equal(extra.list.length, MAX_WATCHING);
    assert.equal(extra.list.some((item) => item.anilistId === '99'), false);

    const marked = addWatching(doc, show('4', 'Show 4'), { recommended: true, fromUserId: SENDER });
    assert.equal(marked.reason, 'marked');
    assert.equal(marked.list.length, MAX_WATCHING);
    assert.equal(marked.list[3].recommended, true);
    assert.equal(marked.list[3].anilistId, '4');
    const removed = removeWatching({ watching: 'Plain text', watchingList: marked.list }, '1');
    assert.equal(removed.removed.anilistId, '1');
    assert.equal(removed.clearLegacy, false);
    const legacy = removeWatching({ watching: 'Plain text', watchingList: removed.list }, 'Plain text');
    assert.equal(legacy.clearLegacy, true);
    assert.equal(legacy.list.length, removed.list.length);
});

test('/watching is add, remove, and clear, and /help lists those', () => {
    const json = command.data.toJSON();
    assert.deepEqual(json.options.map((option) => option.name), ['add', 'remove', 'clear']);
    assert.equal(json.options.every((option) => option.type === 1), true);
    assert.equal(json.options[0].options[0].autocomplete, true);
    assert.equal(json.options[1].options[0].autocomplete, true);
    assert.equal(json.options[0].options[0].name, 'anime');
    const blocks = blocksForCommand(command);
    assert.equal(blocks.length, 3);
    assert.match(blocks[0], /\/watching add/);
    assert.match(blocks[0], /Cowboy Bebop/);
    assert.match(blocks[1], /\/watching remove/);
    assert.match(blocks[2], /\/watching clear/);
    assert.match(CATEGORY_ORDER.find((category) => category.id === 'anime').blurb, /watching/);
});
