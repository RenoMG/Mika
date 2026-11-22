const assert = require('node:assert/strict');
const { test } = require('node:test');

const { choicesFrom, animeAutocomplete } = require('../src/anime/autocomplete');
const { BLOCKED, BIO_MAX, containsSlur, sanitizeUserText } = require('../src/anime/text');

test('slurs are blocked after leet, spacing, punctuation, repeats, and confusables', () => {
    const samples = [
        'nigger',
        'N1GG3R',
        'n i g g e r',
        'n.i.g.g.e.r',
        'niggger',
        `n${'\u0456'}gger`,
        'faggot',
        'heil hitler',
    ];
    for (const sample of samples) {
        assert.equal(containsSlur(sample), true, sample);
        const result = sanitizeUserText(`hello ${sample}`, BIO_MAX);
        assert.equal(result.error, BLOCKED);
        assert.equal(result.text, undefined);
        assert.equal(result.error.includes(sample), false);
        assert.equal(result.error.toLowerCase().includes('nigg'), false);
        assert.equal(result.error.toLowerCase().includes('fagg'), false);
    }
});

test('ordinary profanity and slur-shaped innocent words are allowed', () => {
    const samples = [
        'fuck',
        'fucking',
        'shit',
        'bullshit',
        'damn',
        'ass',
        'bitch',
        'Scunthorpe',
        'I live in Scunthorpe',
        'spice',
        'fagin',
        'Niger',
        'Nigeria',
        'niggle',
        'snippet',
        'snigger',
        'classic',
        'grape',
        'assumption',
        'document',
        'cocktail',
        'Sussex',
        'retirement',
        'class',
        'pass',
    ];
    for (const sample of samples) {
        assert.equal(containsSlur(sample), false, sample);
        const result = sanitizeUserText(sample, BIO_MAX);
        assert.equal(result.error, undefined, sample);
        assert.ok(result.text);
    }
});

test('user text loses mentions, headers, links, and extra blank lines', () => {
    const result = sanitizeUserText(
        '#### Hello\n\n\n\nthere @@everyone <@123456789012345678> <@&123456789012345678> <#123456789012345678> http://evil.test/x',
        BIO_MAX,
    );
    assert.equal(result.error, undefined);
    assert.equal(result.text.includes('@everyone'), false);
    assert.equal(result.text.includes('<@'), false);
    assert.equal(result.text.includes('<#'), false);
    assert.equal(result.text.includes('http'), false);
    assert.equal(result.text.includes('#'), false);
    assert.equal(result.text.includes('\n\n\n'), false);
    assert.match(result.text, /Hello/);
    assert.match(result.text, /everyone/);
    assert.equal(sanitizeUserText('a'.repeat(BIO_MAX + 1), BIO_MAX).error.includes('a'.repeat(20)), false);
    assert.match(sanitizeUserText('a'.repeat(BIO_MAX + 1), BIO_MAX).error, /200/);
    assert.equal(sanitizeUserText({ $gt: '' }, BIO_MAX).error.includes('$'), false);
    assert.equal(sanitizeUserText('   ', BIO_MAX).error, 'Send some text.');
});

test('autocomplete choices are AniList ids only, and a slur answers nothing', async () => {
    const choices = choicesFrom([
        { id: '15', titles: { english: 'Cowboy Bebop' } },
        { id: 'kitsu:15', titles: { english: 'Skip me' } },
        { id: { $gt: '' }, titles: { english: 'Nope' } },
    ]);
    assert.deepEqual(choices, [{ name: 'Cowboy Bebop', value: '15' }]);

    const responded = [];
    await animeAutocomplete({
        options: { getFocused: () => 'n1gg3r' },
        respond: async (rows) => responded.push(rows),
    });
    assert.deepEqual(responded, [[]]);
});
