const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { replyIsPrivate, replyMode } = require('../src/utils/replyVisibility');

function loadCommands() {
    const root = path.join(__dirname, '..', 'src', 'commands');
    const commands = new Map();
    for (const folder of fs.readdirSync(root)) {
        const dir = path.join(root, folder);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.js'))) {
            const command = require(path.join(dir, file));
            if (command && command.data) commands.set(command.data.name, command);
        }
    }
    return commands;
}

function asked(sub, group = null) {
    return { options: { getSubcommand: () => sub, getSubcommandGroup: () => group } };
}

test('every command declares who sees its replies', () => {
    for (const [name, command] of loadCommands()) {
        assert.ok(command.replies === 'public' || command.replies === 'private', `/${name} declares replies`);
        const subs = new Set((command.data.toJSON().options || [])
            .filter((option) => option.type === 1 || option.type === 2)
            .map((option) => option.name));
        for (const key of Object.keys(command.subcommandReplies || {})) {
            assert.ok(subs.has(key), `/${name} override ${key} names a real subcommand`);
        }
    }
});

test('showing things is public; editing, settings, and record lookups are private', () => {
    const commands = loadCommands();
    const mode = (name, sub = null, group = null) => replyMode(commands.get(name), asked(sub, group));
    const publicCases = [
        ['profile'], ['findprofile'], ['search'], ['randomanime'], ['meme'],
        ['watching', 'list'], ['completed', 'list'], ['planning', 'list'], ['favorite', 'list'],
        ['animelist', 'view'], ['animelist', 'entry'], ['animelist', 'stats'], ['customlist', 'view'],
        ['guess', 'play'], ['guess', 'leaderboard'], ['guess', 'stats'],
        ['level'], ['leaderboard'], ['invite'], ['vote'], ['whois'], ['pfp'], ['serverstats'], ['status'], ['ping'],
        ['ban'], ['kick'], ['warn'], ['mute'],
    ];
    const privateCases = [
        ['watching', 'add'], ['watching', 'progress'], ['completed', 'add'], ['planning', 'add'],
        ['favorite', 'add'], ['favorite', 'add', 'character'], ['animelist', 'set'], ['animelist', 'edit'],
        ['customlist', 'create'], ['feed', 'follow'], ['feed', 'following'], ['import', 'anilist'],
        ['settings'], ['setup'], ['bio'], ['genres'], ['recommend'], ['help'], ['config', 'info'], ['infractions'],
    ];
    for (const [name, sub, group] of publicCases) assert.equal(mode(name, sub, group), 'public', `/${[name, group, sub].filter(Boolean).join(' ')}`);
    for (const [name, sub, group] of privateCases) assert.equal(mode(name, sub, group), 'private', `/${[name, group, sub].filter(Boolean).join(' ')}`);
    assert.equal(replyIsPrivate(null, asked('x')), true, 'an unknown command fails closed');
});
