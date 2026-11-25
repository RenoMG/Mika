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

test('the profile embed is a quote plus watching, favorites, completed, genres, and tags', () => {
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
        '✅ Completed',
        '🎭 Genres',
        '🏷️ Tags',
        '\u200b',
    ]);
    assert.equal(embed.fields.some((field) => /accepted/i.test(field.name)), false);
    assert.ok(embed.fields.every((field) => field.inline === true));
    assert.equal(embed.fields[0].value, '• Cowboy Bebop');
    assert.equal(embed.fields[1].value, '1. Trigun');
    assert.equal(embed.fields[2].value, 'Nothing yet');
    assert.equal(embed.fields[3].value, 'Action, Drama, Comedy, Mystery, Sci-Fi, Fantasy, Romance, Slice of Life');
    assert.equal(embed.fields[3].value.includes('Isekai'), false);
    assert.equal(embed.fields[4].value, 'Isekai, Iyashikei, Super Power');
    assert.match(embed.footer.text, /Mika · 🎌 Anime profile/);
    assert.match(embed.footer.text, /🏠 Local/);
    assert.match(embed.footer.text, /Recs off/);
    assert.deepEqual(payload.allowedMentions.parse, []);
    assert.deepEqual(payload.allowedMentions.roles, []);
    assert.equal(payload.allowedMentions.repliedUser, false);
    assert.deepEqual(payload.allowedMentions.users, []);
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
    assert.match(own.footer.text, /🌐 Global/);
    assert.match(own.footer.text, /Recs on/);
    assert.equal(theirs.footer.text, 'Mika · 🎌 Anime profile');
    assert.equal(theirs.footer.text.includes('Local'), false);
    assert.equal(theirs.footer.text.includes('Global'), false);
    assert.deepEqual(other.allowedMentions.users, []);
    assert.deepEqual(other.allowedMentions.parse, []);
});

test('watching is bullets, recommended titles keep the emoji out of storage, and accepted recs are not a field', () => {
    const payload = profileEmbed(emptyProfile({
        watching: 'Hello <@123456789012345678> @everyone',
        watchingList: [
            { anilistId: '1', title: 'Cowboy Bebop', recommended: false, fromUserId: '111111111111111111' },
            { anilistId: '2', title: 'Trigun', recommended: true, fromUserId: '222222222222222222' },
        ],
        accepted: [{ title: 'Hidden rec', fromUserId: '333333333333333333' }],
    }), user('Reno'), { self: false });
    const embed = payload.embeds[0].toJSON();
    const watching = embed.fields.find((field) => field.name === '📺 Watching');
    assert.equal(watching.value, '• 💌 Trigun\n• Cowboy Bebop\n• Hello user everyone');
    assert.equal(watching.value.includes('<@'), false);
    assert.equal(watching.value.includes('@everyone'), false);
    assert.equal(embed.fields.some((field) => /accepted/i.test(field.name)), false);
    assert.equal(JSON.stringify(embed).includes('Hidden rec'), false);
    assert.deepEqual(payload.allowedMentions.users, []);
    assert.deepEqual(payload.allowedMentions.parse, []);
});

test('the profile shows the five newest watching rows and the five newest completed rows', () => {
    const payload = profileEmbed(emptyProfile({
        watching: 'Old <@123456789012345678> note',
        watchingList: Array.from({ length: 6 }, (_, index) => ({
            anilistId: String(index + 1),
            title: `Show ${index + 1}`,
            recommended: index === 5,
            fromUserId: '',
        })),
        completedList: [
            { anilistId: '10', title: 'Oldest', completedAt: new Date('2020-01-01T00:00:00Z'), recommended: false },
            { anilistId: '11', title: 'Second', completedAt: new Date('2021-01-01T00:00:00Z'), recommended: false },
            { anilistId: '12', title: 'Third', completedAt: new Date('2022-01-01T00:00:00Z'), recommended: false },
            { anilistId: '13', title: 'Fourth', completedAt: new Date('2023-01-01T00:00:00Z'), recommended: false },
            { anilistId: '14', title: 'Fifth', completedAt: new Date('2024-01-01T00:00:00Z'), recommended: false },
            { anilistId: '15', title: 'Newest', completedAt: new Date('2025-06-01T00:00:00Z'), recommended: true },
        ],
    }), user('Reno'), { self: false });
    const fields = payload.embeds[0].toJSON().fields;
    const watching = fields.find((field) => field.name === '📺 Watching');
    const completed = fields.find((field) => field.name === '✅ Completed');
    const favorites = fields.find((field) => field.name === '⭐ Favorites');
    assert.equal(watching.value, [
        '• 💌 Show 6',
        '• Show 5',
        '• Show 4',
        '• Show 3',
        '• Show 2',
        '• Old user note',
        '+1 more · /watching list',
    ].join('\n'));
    assert.equal(watching.value.includes('Show 1'), false);
    assert.equal(completed.value, [
        '• 💌 Newest',
        '• Fifth',
        '• Fourth',
        '• Third',
        '• Second',
        '+1 more · /completed list',
    ].join('\n'));
    assert.equal(completed.value.includes('<t:'), false);
    assert.equal(completed.value.includes('Oldest'), false);
    assert.equal(favorites.value, 'Nothing yet');
    assert.deepEqual(payload.allowedMentions.parse, []);
    assert.deepEqual(payload.allowedMentions.users, []);
});

test('a favorites list is numbered and wins over the legacy title', () => {
    const payload = profileEmbed(emptyProfile({
        favoriteTitle: 'Ignored',
        favorites: [
            { anilistId: '2', title: 'Cowboy Bebop' },
            { anilistId: '3', title: 'Trigun' },
        ],
    }), user('Reno'), { self: false });
    const favorites = payload.embeds[0].toJSON().fields.find((field) => field.name === '⭐ Favorites');
    assert.equal(favorites.value, '1. Cowboy Bebop\n2. Trigun');
    assert.equal(favorites.value.includes('Ignored'), false);
});
