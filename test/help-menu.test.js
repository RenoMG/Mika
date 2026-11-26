const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const helpMenu = require('../src/commands/help/menu/helpMenu');

function allCommands() {
    const root = path.join(__dirname, '..', 'src', 'commands');
    const commands = [];
    for (const folder of fs.readdirSync(root)) {
        for (const file of fs.readdirSync(path.join(root, folder)).filter((name) => name.endsWith('.js'))) {
            commands.push(require(path.join(root, folder, file)));
        }
    }
    return commands;
}

function pageText(categories, id) {
    return helpMenu.buildHelpView(categories, id).embeds.map((embed) => embed.data.description).join('\n\n');
}

test('section blurbs fit the dropdown, even when marked off', () => {
    const everythingOff = Object.fromEntries(allCommands().filter((command) => command.configKey)
        .map((command) => [command.configKey, [{ Status: 'false' }]]));
    for (const config of [null, everythingOff]) {
        for (const category of helpMenu.groupCommands(allCommands(), config)) {
            assert.ok(category.blurb.length <= 100, `${category.id}: ${category.blurb.length}`);
        }
    }
});

test('member-facing sections come first, staff sections last', () => {
    const ids = helpMenu.groupCommands(allCommands()).map((category) => category.id);
    assert.deepEqual(ids, ['anime', 'guess', 'leveling', 'information', 'moderation', 'configuration']);
});

test('related commands sit together instead of A-Z', () => {
    const categories = helpMenu.groupCommands(allCommands());
    const names = (id) => categories.find((category) => category.id === id).commands.map((command) => command.data.name);
    const moderation = names('moderation');
    for (const [first, second] of [['warn', 'unwarn'], ['mute', 'unmute'], ['ban', 'unban']]) {
        assert.equal(moderation.indexOf(second), moderation.indexOf(first) + 1, `${first} then ${second}`);
    }
    assert.ok(moderation.indexOf('infractions') < moderation.indexOf('clearinfractions'));
    assert.deepEqual(names('leveling'), ['level', 'leaderboard']);
    // Every category's order list names real commands only.
    for (const category of helpMenu.CATEGORY_ORDER) {
        for (const name of category.order || []) assert.ok(names(category.id).includes(name), `${category.id}: ${name}`);
    }

    const guess = pageText(categories, 'guess');
    const play = guess.indexOf('**/guess play**');
    assert.ok(play >= 0 && play < guess.indexOf('**/guess duel**'));
    assert.ok(guess.indexOf('**/guess shop**') < guess.indexOf('**/guess about**'));
});

test('permissions use the names Discord shows in server settings', () => {
    const categories = helpMenu.groupCommands(allCommands());
    const moderation = pageText(categories, 'moderation');
    const configuration = pageText(categories, 'configuration');
    assert.match(moderation, /\*\*\/mute\*\*[^*]*Requires Timeout Members\./);
    assert.match(configuration, /Requires Manage Server\./);
    assert.doesNotMatch(moderation + configuration, /Moderate Members|Manage Guild/);
});

test('every description reads the same way and fits Discord', () => {
    for (const command of allCommands()) {
        const json = command.data.toJSON();
        const entries = [[json.name, json.description]];
        for (const option of json.options || []) {
            if (option.type === 1) entries.push([`${json.name} ${option.name}`, option.description]);
        }
        for (const [name, description] of entries) {
            assert.ok(description.length <= 100, name);
            assert.match(description, /\.$/, `${name} ends with a period`);
            // "Shows …", "Bans …": a verb ending in s, not "Show …" or "Returns …".
            assert.match(description.split(/[ ,:]/)[0], /[a-z]s$/, `${name}: ${description}`);
            assert.doesNotMatch(description, /^Returns /, name);
        }
    }
});

test('the home screen explains why a command can show as off', () => {
    const home = helpMenu.buildHelpView(helpMenu.groupCommands(allCommands()), null).embeds[0].data.description;
    assert.match(home, /turn features off with `\/config`/);
    assert.doesNotMatch(home, /Open this menu anytime/);
});

test('the help menu closes after idle time, not mid-browse', async () => {
    const help = require('../src/commands/help/help');
    let collectorOptions = null;
    const message = {
        createMessageComponentCollector(options) {
            collectorOptions = options;
            return { on() { return this; } };
        },
    };
    await help.execute({
        guild: null,
        user: { id: '1' },
        deferred: false,
        replied: false,
        async reply() { return { resource: { message } }; },
    }, { commands: new Map(allCommands().map((command) => [command.data.name, command])) });
    assert.deepEqual(collectorOptions, { idle: helpMenu.HELP_TIMEOUT_MS });
});
