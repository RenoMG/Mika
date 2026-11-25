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

test('config menus and /help document the placeholders', () => {
    const config = require('../src/commands/configuration/config');
    const { controlOf, sectionEmbed } = require('../src/commands/configuration/hub/sections');
    const helpMenu = require('../src/commands/help/menu/helpMenu');
    const json = config.data.toJSON();
    assert.ok(json.options.every((option) => option.type === 3), '/config takes only the section choice');

    const greeting = controlOf('welcome', 'gmessage');
    const farewell = controlOf('welcome', 'fmessage');
    const message = controlOf('leveling', 'message');
    for (const control of [greeting, farewell, message]) {
        assert.match(control.hint, /\{user\}/);
        assert.match(control.hint, /mention/);
        assert.match(control.hint, /\{userd\}/);
        assert.match(control.hint, /display name/);
    }
    assert.match(message.hint, /\{level\}/);
    for (const [section, extra] of [['welcome', null], ['leveling', /`\{level\}` new level/]]) {
        const note = sectionEmbed(section, {}).data.fields.find((field) => field.name === 'Placeholders');
        assert.match(note.value, /`\{user\}` mention/);
        assert.match(note.value, /`\{userd\}` display name/);
        if (extra) assert.match(note.value, extra);
    }

    const [block] = helpMenu.blocksForCommand(config);
    assert.match(block, /\*\*\/config\*\*/);
    assert.match(block, /`\{user\}` mention/);
    assert.match(block, /`\{userd\}` display name/);
    assert.match(block, /`\{level\}` new level/);
});
