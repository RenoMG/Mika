const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    MAX_FAVORITES,
    addFavorite,
    applyFavorites,
    clearFavorites,
    readFavorites,
    removeFavorite,
    reorderFavorites,
} = require('../src/anime/favorites');

function profile(extra = {}) {
    return {
        favoriteId: '',
        favoriteTitle: '',
        favorites: [],
        ...extra,
    };
}

function show(id, title) {
    return { id, titles: { english: title } };
}

test('a legacy favorite is the list until the owner edits it', () => {
    const doc = profile({ favoriteId: '7', favoriteTitle: 'Trigun', favorites: [] });
    assert.deepEqual(readFavorites(doc), [{ anilistId: '7', title: 'Trigun' }]);
    assert.equal(doc.favoriteId, '7');
    assert.deepEqual(doc.favorites, []);

    const added = addFavorite(doc, show('8', 'Cowboy Bebop'));
    assert.equal(added.ok, true);
    assert.deepEqual(added.list.map((item) => item.anilistId), ['7', '8']);
    applyFavorites(doc, added.list);
    assert.equal(doc.favoriteId, '7');
    assert.equal(doc.favoriteTitle, 'Trigun');
    assert.equal(doc.favorites.length, 2);
});

test('add, remove, reorder, and clear stay inside five and do not revive a cleared legacy favorite', () => {
    const doc = profile();
    let list = [];
    for (let index = 1; index <= 5; index += 1) {
        const added = addFavorite({ ...doc, favorites: list }, show(String(index), `Show ${index}`));
        assert.equal(added.ok, true);
        list = added.list;
    }
    assert.equal(list.length, MAX_FAVORITES);
    const full = addFavorite({ favorites: list }, show('6', 'Show 6'));
    assert.equal(full.reason, 'full');
    assert.equal(full.list.length, 5);

    const duplicate = addFavorite({ favorites: list }, show('1', 'Show 1'));
    assert.equal(duplicate.reason, 'duplicate');

    const removed = removeFavorite({ favorites: list }, '3');
    assert.equal(removed.ok, true);
    assert.deepEqual(removed.list.map((item) => item.anilistId), ['1', '2', '4', '5']);
    const bySpot = removeFavorite({ favorites: removed.list }, '1');
    assert.equal(bySpot.removed.anilistId, '1');

    const moved = reorderFavorites({ favorites: list }, 5, 1);
    assert.equal(moved.ok, true);
    assert.equal(moved.list[0].anilistId, '5');
    assert.equal(moved.list[4].anilistId, '4');
    assert.equal(reorderFavorites({ favorites: list }, 6, 1).ok, false);

    applyFavorites(doc, clearFavorites().list);
    assert.deepEqual(doc.favorites, []);
    assert.equal(doc.favoriteId, '');
    assert.equal(doc.favoriteTitle, '');
    assert.deepEqual(readFavorites(doc), []);
});
