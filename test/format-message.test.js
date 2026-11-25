const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
    formatMessage,
    isDefaultRequest,
    memberValues,
} = require('../src/utils/formatMessage');

test('replaces every placeholder, including repeats and mixed case', () => {
    const text = formatMessage(
        '{user} {USER} {User} and {userd} {USERD} {UserD} level {level} {LEVEL} {Level}',
        { user: '<@7>', userd: 'Nick', level: 4 },
    );
    assert.equal(text, '<@7> <@7> <@7> and Nick Nick Nick level 4 4 4');
});

test('{user} does not consume {userd}, and unknown tokens stay put', () => {
    const text = formatMessage('{userd} {users} {server} {nope} {level-up}', {
        user: '<@7>',
        userd: 'Nick {user} $&',
        server: null,
        level: 2,
    });
    assert.equal(text, 'Nick {user} $& {users} {server} {nope} {level-up}');
});

test('a provided extra placeholder such as {server} is replaced once', () => {
    assert.equal(
        formatMessage('Welcome to {SERVER}, {user}', { user: '<@7>', server: 'Mika {user}' }),
        'Welcome to Mika {user}, <@7>',
    );
});

test('null and non-string templates format without throwing', () => {
    assert.equal(formatMessage(null, { user: '<@7>' }), '');
    assert.equal(formatMessage(undefined, { user: '<@7>' }), '');
    assert.equal(formatMessage(0, {}), '0');
});

test('default is only the whole message option', () => {
    assert.equal(isDefaultRequest('default'), true);
    assert.equal(isDefaultRequest(' Default '), true);
    assert.equal(isDefaultRequest('DEFAULT'), true);
    assert.equal(isDefaultRequest('my default'), false);
    assert.equal(isDefaultRequest('default!'), false);
    assert.equal(isDefaultRequest(''), false);
    assert.equal(isDefaultRequest(null), false);
});

test('member values use the nickname, then the global display name', () => {
    assert.deepEqual(memberValues({
        displayName: 'Nick',
        user: { id: '1', username: 'reno', globalName: 'Global' },
    }), { user: '<@1>', userd: 'Nick' });
    assert.deepEqual(memberValues({
        user: { id: '1', username: 'reno', globalName: 'Global' },
    }), { user: '<@1>', userd: 'Global' });
    assert.equal(memberValues({ user: { username: 'reno' } }).userd, 'reno');
});

test('config menus and /help examples document the placeholders', () => {
    const config = require('../src/commands/configuration/config');
    const panel = require('../src/commands/configuration/handlers/panel');
    const helpMenu = require('../src/commands/help/menu/helpMenu');
    const json = config.data.toJSON();
    for (const sub of json.options) {
        assert.ok(!sub.options || sub.options.length === 0, `${sub.name} should take no options`);
        assert.ok(sub.description.length <= 100, sub.name);
    }

    const greeting = panel.FIELDS.welcome.find((field) => field.id === 'gmessage');
    const farewell = panel.FIELDS.welcome.find((field) => field.id === 'fmessage');
    const message = panel.FIELDS.leveling.find((field) => field.id === 'message');
    for (const field of [greeting, farewell, message]) {
        assert.match(field.placeholder, /\{user\}/);
        assert.match(field.placeholder, /mention/);
        assert.match(field.placeholder, /\{userd\}/);
        assert.match(field.placeholder, /display name/);
    }
    assert.match(message.placeholder, /\{level\}/);
    assert.match(message.placeholder, /default/i);

    const blocks = helpMenu.blocksForCommand(config);
    const welcomeBlock = blocks.find((block) => block.includes('**/config welcome**'));
    const levelingBlock = blocks.find((block) => block.includes('**/config leveling**'));
    assert.match(welcomeBlock, /`\{user\}` mention/);
    assert.match(welcomeBlock, /`\{userd\}` display name/);
    assert.match(levelingBlock, /`\{user\}` mention/);
    assert.match(levelingBlock, /`\{userd\}` display name/);
    assert.match(levelingBlock, /`\{level\}` new level/);
    assert.match(levelingBlock, /Type `default` to reset/);
});
