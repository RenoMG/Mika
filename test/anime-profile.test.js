const assert = require('node:assert/strict');
const { test } = require('node:test');

const { profileEmbed } = require('../src/anime/profileView');

function user(name) {
    return {
        username: name,
        displayAvatarURL: () => 'https://cdn.example/avatar.png',
    };
}

function emptyProfile(extra = {}) {
    return {
        bio: '',
        watching: '',
        favoriteTitle: '',
        genres: [],
        tags: [],
        accepted: [],
        discoverable: false,
        recommendations: false,
        ...extra,
    };
}

test('the profile embed is a quote plus a 2x2 of emoji fields', () => {
    const payload = profileEmbed(emptyProfile({
        bio: 'hello <@123456789012345678> @everyone',
        watching: 'Cowboy Bebop',
        favoriteTitle: 'Trigun',
        genres: ['Action', 'Drama', 'Comedy', 'Mystery', 'Sci-Fi', 'Fantasy', 'Romance', 'Slice of Life'],
        tags: ['Isekai', 'Iyashikei', 'Super Power'],
        accepted: [
            { title: 'Older', fromUserId: '111111111111111111' },
            { title: 'One', fromUserId: '222222222222222222' },
            { title: 'Two', fromUserId: '333333333333333333' },
            { title: 'Three', fromUserId: '444444444444444444' },
        ],
    }), user('Reno'), { self: true });
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.color, 0x3498db);
    assert.match(embed.description, /^> hello user everyone/);
    assert.equal(embed.description.includes('<@'), false);
    assert.equal(embed.description.includes('@everyone'), false);
    assert.equal(embed.thumbnail.url, 'https://cdn.example/avatar.png');
    assert.deepEqual(embed.fields.map((field) => field.name), [
        '📺 Watching',
        '⭐ Favorites',
        '\u200b',
        '🎭 Genres',
        '💌 Accepted recs',
        '\u200b',
    ]);
    assert.ok(embed.fields.every((field) => field.inline === true));
    assert.equal(embed.fields[0].value, 'Cowboy Bebop');
    assert.equal(embed.fields[1].value, 'Trigun');
    assert.match(embed.fields[3].value, /Action, Drama, Comedy, Mystery, Sci-Fi, Fantasy \+2 more/);
    assert.match(embed.fields[3].value, /Isekai, Iyashikei, Super Power/);
    assert.match(embed.fields[4].value, /One/);
    assert.match(embed.fields[4].value, /Two/);
    assert.match(embed.fields[4].value, /Three/);
    assert.equal(embed.fields[4].value.includes('Older'), false);
    assert.match(embed.fields[4].value, /\+1 more/);
    assert.match(embed.footer.text, /Mika \| 🎌 anime/);
    assert.match(embed.footer.text, /🔒 Hidden/);
    assert.match(embed.footer.text, /recs off/);
    assert.deepEqual(payload.allowedMentions.parse, []);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.equal(payload.allowedMentions.repliedUser, false);
    assert.deepEqual(payload.allowedMentions.users, [
        '444444444444444444',
        '333333333333333333',
        '222222222222222222',
    ]);
});

test('an empty profile says Nothing yet and hides privacy from other people', () => {
    const self = profileEmbed(emptyProfile({ discoverable: true, recommendations: true }), user('Reno'), { self: true });
    const other = profileEmbed(emptyProfile(), user('Reno'), { self: false });
    const own = self.embeds[0].toJSON();
    const theirs = other.embeds[0].toJSON();
    assert.equal(own.description, '> Nothing yet');
    for (const field of own.fields) {
        if (field.name === '\u200b') continue;
        assert.equal(field.value, 'Nothing yet');
    }
    assert.match(own.footer.text, /🌐 Discoverable/);
    assert.match(own.footer.text, /recs on/);
    assert.equal(theirs.footer.text, 'Mika | 🎌 anime');
    assert.equal(theirs.footer.text.includes('Hidden'), false);
    assert.equal(theirs.footer.text.includes('Discoverable'), false);
    assert.deepEqual(other.allowedMentions.users, []);
    assert.deepEqual(other.allowedMentions.parse, []);
});
