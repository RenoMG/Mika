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

test('slash option descriptions and /help examples document the placeholders', () => {
    const config = require('../src/commands/configuration/config');
    const helpMenu = require('../src/commands/help/menu/helpMenu');
    const json = config.data.toJSON();
    for (const sub of json.options) {
        for (const option of sub.options || []) {
            assert.ok(option.description.length <= 100, `${sub.name} ${option.name}: ${option.description}`);
        }
    }

    const welcome = json.options.find((option) => option.name === 'welcome');
    const leveling = json.options.find((option) => option.name === 'leveling');
    const gmessage = welcome.options.find((option) => option.name === 'gmessage');
    const fmessage = welcome.options.find((option) => option.name === 'fmessage');
    const message = leveling.options.find((option) => option.name === 'message');
    for (const option of [gmessage, fmessage, message]) {
        assert.match(option.description, /\{user\}/);
        assert.match(option.description, /mention/);
        assert.match(option.description, /\{userd\}/);
        assert.match(option.description, /display name/);
    }
    assert.match(message.description, /\{level\}/);
    assert.match(message.description, /default/i);

    const blocks = helpMenu.blocksForCommand(config);
    const welcomeBlock = blocks.find((block) => block.includes('**/config welcome**'));
    const levelingBlock = blocks.find((block) => block.includes('**/config leveling**'));
    assert.match(welcomeBlock, /\{user\}=mention/);
    assert.match(welcomeBlock, /\{userd\}=display name/);
    assert.match(levelingBlock, /\{user\}=mention/);
    assert.match(levelingBlock, /\{userd\}=display name/);
    assert.match(levelingBlock, /\{level\}=level/);
    assert.match(levelingBlock, /message:default resets/);
});
