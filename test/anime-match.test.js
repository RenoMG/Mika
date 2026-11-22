const assert = require('node:assert/strict');
const { test } = require('node:test');
const { matchKind, normalizeTitle, pickTitle } = require('../src/anime/match');

function media(id, titles, synonyms = []) {
    return { id, titles, synonyms };
}

test('titles normalize punctuation and case', () => {
    assert.equal(normalizeTitle('Re:Zero'), normalizeTitle('re zero'));
    assert.equal(normalizeTitle('Cowboy Bebop'), 'cowboy bebop');
});

test('an exact or single near title is chosen, and ambiguous titles are not', () => {
    const bebop = media('1', { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: 'カウボーイビバップ' });
    const brother = media('2', { romaji: 'Cowboy Bebop: Tengoku no Tobira', english: 'Cowboy Bebop: The Movie' });
    const zero = media('3', { romaji: 'Re:Zero', english: '', native: '' }, ['Re:Zero kara Hajimeru Isekai Seikatsu']);

    assert.equal(matchKind('cowboy bebop', bebop), 'exact');
    assert.equal(matchKind('Re zero', zero), 'exact');
    assert.equal(matchKind('Cowby Bebop', bebop), 'near');
    assert.equal(matchKind('bebop', bebop), null);
    assert.equal(pickTitle('Cowboy Bebop', [bebop, brother]).id, '1');
    assert.equal(pickTitle('Cowby Bebop', [bebop, brother]).id, '1');
    assert.equal(pickTitle('bebop', [bebop, brother]), null);
    assert.equal(pickTitle('Cowboy Bebop', [bebop, { ...bebop, id: '9' }]), null);
    assert.equal(pickTitle('Re:Zero', [zero]).id, '3');
    assert.equal(pickTitle('', [bebop]), null);
});
