const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { MessageFlags } = require('discord.js');

const VIEWER = '100000000000000001';
const OWNER = '100000000000000002';
const HIDDEN_USER = '100000000000000004';
const MISSING = '100000000000000009';

let mongoose;
let mongod;
let AnimeProfile;
let watchingCommand;
let completedCommand;
let HIDDEN;
let NOT_SETUP;
let SETUP_FIRST;
let MENU_TIMEOUT_MS;
let WATCHING_PREV;
let WATCHING_NEXT;
let COMPLETED_PREV;
let COMPLETED_NEXT;
let completeFromWatching;
let addCompleted;
let removeCompleted;
let completedListLines;
let MAX_COMPLETED;
let LEGACY_COMPLETE;
let blocksForCommand;

function rows(count, title, extra) {
    return Array.from({ length: count }, (_, index) => ({
        anilistId: String(index + 1),
        title: `${title} ${index + 1}`,
        recommended: false,
        fromUserId: '',
        ...(typeof extra === 'function' ? extra(index) : extra),
    }));
}

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    AnimeProfile = require('../src/Models/AnimeProfile');
    ({
        HIDDEN,
        NOT_SETUP,
        SETUP_FIRST,
    } = require('../src/anime/profiles'));
    ({
        MENU_TIMEOUT_MS,
    } = require('../src/anime/menu'));
    ({
        WATCHING_PREV,
        WATCHING_NEXT,
        COMPLETED_PREV,
        COMPLETED_NEXT,
    } = require('../src/anime/pagedList'));
    ({
        MAX_COMPLETED,
        LEGACY_COMPLETE,
        completeFromWatching,
        addCompleted,
        removeCompleted,
        completedListLines,
    } = require('../src/anime/completed'));
    ({ blocksForCommand } = require('../src/commands/help/menu/helpMenu'));
    watchingCommand = require('../src/commands/anime/watching');
    completedCommand = require('../src/commands/anime/completed');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

async function reset() {
    await AnimeProfile.deleteMany({});
}

test('completing moves a show, redates a duplicate, refuses a legacy line, and stops at the cap', () => {
    const now = new Date('2024-03-02T15:00:00Z');
    const later = new Date('2024-04-01T00:00:00Z');
    const profile = {
        watching: 'Plain text',
        watchingList: [
            { anilistId: '5', title: 'Trigun', recommended: true, fromUserId: '100000000000000009', addedAt: new Date('2024-01-01T00:00:00Z') },
            { anilistId: '6', title: 'Bebop', recommended: false, fromUserId: '' },
        ],
        completedList: [],
    };
    const legacy = completeFromWatching(profile, 'legacy', now);
    assert.equal(legacy.ok, false);
    assert.equal(legacy.reason, 'legacy');
    assert.match(LEGACY_COMPLETE, /no AniList id/);
    const byText = completeFromWatching(profile, 'Plain text', now);
    assert.equal(byText.reason, 'legacy');
    assert.equal(profile.watchingList.length, 2);

    const moved = completeFromWatching(profile, '5', now);
    assert.equal(moved.ok, true);
    assert.equal(moved.redated, false);
    assert.deepEqual(moved.watching.map((item) => item.anilistId), ['6']);
    assert.equal(moved.completed.length, 1);
    assert.equal(moved.completed[0].anilistId, '5');
    assert.equal(moved.completed[0].title, 'Trigun');
    assert.equal(moved.completed[0].title.includes('💌'), false);
    assert.equal(moved.completed[0].recommended, true);
    assert.equal(moved.completed[0].completedAt.getTime(), now.getTime());

    profile.watchingList = moved.watching.concat([
        { anilistId: '5', title: 'Trigun', recommended: false, fromUserId: '' },
    ]);
    profile.completedList = moved.completed;
    const again = completeFromWatching(profile, '5', later);
    assert.equal(again.ok, true);
    assert.equal(again.redated, true);
    assert.equal(again.completed.length, 1);
    assert.equal(again.completed[0].completedAt.getTime(), later.getTime());
    assert.equal(again.completed[0].recommended, true);
    assert.equal(again.watching.some((item) => item.anilistId === '5'), false);

    const unix = Math.floor(later.getTime() / 1000);
    const lines = completedListLines({ completedList: again.completed });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^• 💌 Trigun · /);
    assert.match(lines[0], new RegExp(`<t:${unix}:d>`));

    const packed = {
        watching: '',
        watchingList: [{ anilistId: '99999', title: 'Extra', recommended: false, fromUserId: '' }],
        completedList: rows(MAX_COMPLETED, 'Done', () => ({
            completedAt: new Date('2020-01-01T00:00:00Z'),
        })),
    };
    assert.equal(MAX_COMPLETED, 2000);
    const blocked = completeFromWatching(packed, '99999', now);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'full');
    const redated = addCompleted({
        watchingList: [],
        completedList: packed.completedList,
    }, { id: '1', titles: { english: 'Done 1' } }, later);
    assert.equal(redated.ok, true);
    assert.equal(redated.redated, true);
    assert.equal(redated.completed.length, MAX_COMPLETED);
    assert.equal(redated.completed.find((item) => item.anilistId === '1').completedAt.getTime(), later.getTime());

    const fresh = addCompleted({
        watchingList: [{ anilistId: '8', title: 'Planetes', recommended: true, fromUserId: '' }],
        completedList: [],
    }, { id: '8', titles: { english: 'Planetes' } }, now);
    assert.equal(fresh.ok, true);
    assert.equal(fresh.removedWatching, true);
    assert.equal(fresh.watching.length, 0);
    assert.equal(fresh.completed[0].recommended, true);
    const removed = removeCompleted({ completedList: fresh.completed }, '8');
    assert.equal(removed.ok, true);
    assert.equal(removed.removed.title, 'Planetes');
    assert.equal(removed.list.length, 0);
    assert.equal(removeCompleted({ completedList: [] }, '8').ok, false);
});

test('/completed help lists list, add, and remove', () => {
    const json = completedCommand.data.toJSON();
    assert.deepEqual(json.options.map((option) => option.name), ['list', 'add', 'remove']);
    assert.equal(json.options[1].options[0].autocomplete, true);
    assert.equal(json.options[2].options[0].autocomplete, true);
    const blocks = blocksForCommand(completedCommand);
    assert.equal(blocks.length, 3);
    assert.match(blocks[0], /\/completed list/);
    assert.match(blocks[1], /\/completed add/);
    assert.match(blocks[1], /Cowboy Bebop/);
    assert.match(blocks[2], /\/completed remove/);
});

function bag() {
    const handlers = {};
    const state = { options: null };
    return {
        handlers,
        state,
        createMessageComponentCollector(options) {
            state.options = options;
            return {
                on(event, fn) {
                    handlers[event] = fn;
                },
            };
        },
    };
}

async function run(command, { userId, target = null, member = null, sub = 'list', value = null } = {}) {
    const replies = [];
    const edits = [];
    const message = bag();
    const interaction = {
        user: { id: userId, username: 'Viewer', globalName: 'Viewer' },
        member: null,
        options: {
            getSubcommand: () => sub,
            getUser: () => target,
            getMember: () => (target ? member : null),
            getString: () => value,
            getFocused: () => ({ value: '' }),
        },
        reply: async (body) => {
            replies.push(body);
            return { resource: { message } };
        },
        editReply: async (body) => {
            edits.push(body);
        },
    };
    await command.execute(interaction);
    return { replies, edits, message };
}

test('/watching list is public for the same people as /profile, paged, and invoker-only', async () => {
    await reset();
    await AnimeProfile.create({
        userId: OWNER,
        discoverable: false,
        recommendations: false,
        watching: 'Old show',
        watchingList: rows(11, 'Show', (index) => ({ recommended: index === 10 })),
    });
    await AnimeProfile.create({
        userId: HIDDEN_USER,
        discoverable: false,
        recommendations: false,
        watchingList: rows(1, 'Secret'),
    });

    const self = await run(watchingCommand, { userId: OWNER });
    const embed = self.replies[0].embeds[0].toJSON();
    assert.equal(self.replies[0].flags, undefined);
    assert.deepEqual(self.replies[0].allowedMentions.parse, []);
    assert.deepEqual(self.replies[0].allowedMentions.users, []);
    assert.equal(embed.title, "📺 Viewer's watching list");
    assert.match(embed.description, /^• 💌 Show 11/);
    assert.equal(embed.description.includes('Show 1\n') || embed.description.endsWith('Show 1'), false);
    assert.equal(embed.description.split('\n').length, 10);
    assert.match(embed.footer.text, /Page 1 of 2/);
    assert.equal(self.message.state.options.time, MENU_TIMEOUT_MS);
    assert.equal(MENU_TIMEOUT_MS, 120000);
    const buttons = self.replies[0].components[0].toJSON().components;
    assert.equal(buttons[0].label, 'Previous');
    assert.equal(buttons[0].custom_id, WATCHING_PREV);
    assert.equal(buttons[0].disabled, true);
    assert.equal(buttons[1].label, 'Next');
    assert.equal(buttons[1].custom_id, WATCHING_NEXT);
    assert.equal(buttons[1].disabled, false);

    const stranger = [];
    await self.message.handlers.collect({
        user: { id: VIEWER },
        customId: WATCHING_NEXT,
        reply: async (body) => stranger.push(body),
        update: async () => {
            throw new Error('stranger updated the list');
        },
    });
    assert.match(stranger[0].content, /Only the person who used \/watching/);
    assert.equal(stranger[0].flags, MessageFlags.Ephemeral);

    const updates = [];
    await self.message.handlers.collect({
        user: { id: OWNER },
        customId: WATCHING_NEXT,
        reply: async () => {},
        update: async (body) => updates.push(body),
    });
    const pageTwo = updates[0].embeds[0].toJSON();
    assert.match(pageTwo.description, /• Show 1/);
    assert.match(pageTwo.description, /• Old show/);
    assert.match(pageTwo.footer.text, /Page 2 of 2/);
    assert.deepEqual(updates[0].allowedMentions.parse, []);
    assert.equal(pageTwo.description.split('\n').some((line) => /^\d+\./.test(line)), false);

    await self.message.handlers.end();
    const ended = self.edits[0].components[0].toJSON().components;
    assert.equal(ended[0].disabled, true);
    assert.equal(ended[1].disabled, true);

    const hiddenTarget = { id: HIDDEN_USER, username: 'Hidden' };
    const missingTarget = { id: MISSING, username: 'Missing' };
    const ownerTarget = { id: OWNER, username: 'Owner', globalName: 'Owner' };
    const farHidden = await run(watchingCommand, { userId: VIEWER, target: hiddenTarget, member: null });
    const farMissing = await run(watchingCommand, { userId: VIEWER, target: missingTarget, member: null });
    assert.equal(farHidden.replies[0].content, HIDDEN);
    assert.equal(farMissing.replies[0].content, HIDDEN);
    assert.equal(farHidden.replies[0].content, farMissing.replies[0].content);
    assert.equal(farHidden.replies[0].flags, MessageFlags.Ephemeral);
    assert.equal(farHidden.replies[0].embeds, undefined);

    const here = await run(watchingCommand, { userId: VIEWER, target: hiddenTarget, member: { id: HIDDEN_USER } });
    assert.equal(here.replies[0].flags, undefined);
    assert.match(here.replies[0].embeds[0].toJSON().description, /• Secret 1/);
    assert.deepEqual(here.replies[0].components, []);

    await AnimeProfile.updateOne({ userId: OWNER }, { discoverable: true });
    const farPublic = await run(watchingCommand, { userId: VIEWER, target: ownerTarget, member: null });
    assert.equal(farPublic.replies[0].flags, undefined);
    assert.equal(farPublic.replies[0].embeds[0].toJSON().title, "📺 Owner's watching list");

    const none = await run(watchingCommand, { userId: VIEWER });
    assert.equal(none.replies[0].content, SETUP_FIRST);
    assert.equal(none.replies[0].flags, MessageFlags.Ephemeral);
    const absentHere = await run(watchingCommand, { userId: VIEWER, target: missingTarget, member: { id: MISSING } });
    assert.equal(absentHere.replies[0].content, NOT_SETUP);

    const completedFar = await run(completedCommand, { userId: VIEWER, target: hiddenTarget, member: null });
    assert.equal(completedFar.replies[0].content, farHidden.replies[0].content);
    assert.equal(completedFar.replies[0].flags, MessageFlags.Ephemeral);
});

test('/completed list pages by completion date and remove deletes your own row', async () => {
    await reset();
    const newest = new Date(Date.UTC(2024, 0, 11));
    await AnimeProfile.create({
        userId: OWNER,
        discoverable: false,
        watching: 'Keep me',
        watchingList: [{ anilistId: '40', title: 'Cowboy Bebop', recommended: false, fromUserId: '' }],
        completedList: rows(11, 'Done', (index) => ({
            completedAt: new Date(Date.UTC(2024, 0, index + 1)),
            recommended: index === 10,
        })),
    });

    const choices = [];
    await watchingCommand.autocomplete({
        user: { id: OWNER },
        options: {
            getSubcommand: () => 'complete',
            getFocused: () => ({ value: '' }),
        },
        respond: async (found) => choices.push(...found),
    });
    assert.deepEqual(choices.map((choice) => choice.value), ['40']);

    const legacyReplies = [];
    await watchingCommand.execute({
        user: { id: OWNER, username: 'Owner' },
        member: null,
        options: {
            getSubcommand: () => 'complete',
            getString: () => 'legacy',
            getUser: () => null,
        },
        reply: async (body) => legacyReplies.push(body),
    });
    assert.match(legacyReplies[0].content, /no AniList id/);
    assert.deepEqual(legacyReplies[0].allowedMentions.parse, []);
    assert.equal((await AnimeProfile.findOne({ userId: OWNER })).watching, 'Keep me');

    const opened = await run(completedCommand, { userId: OWNER });
    const first = opened.replies[0].embeds[0].toJSON();
    const unix = Math.floor(newest.getTime() / 1000);
    assert.match(first.description, new RegExp(`^• 💌 Done 11 · <t:${unix}:d>`));
    assert.equal(first.description.split('\n').length, 10);
    assert.match(first.footer.text, /Page 1 of 2/);
    assert.equal(opened.replies[0].flags, undefined);
    assert.deepEqual(opened.replies[0].allowedMentions.parse, []);
    assert.equal(opened.message.state.options.time, 120000);
    const live = opened.replies[0].components[0].toJSON().components;
    assert.equal(live[0].custom_id, COMPLETED_PREV);
    assert.equal(live[1].custom_id, COMPLETED_NEXT);

    const updates = [];
    await opened.message.handlers.collect({
        user: { id: OWNER },
        customId: COMPLETED_NEXT,
        reply: async () => {},
        update: async (body) => updates.push(body),
    });
    const oldest = new Date(Date.UTC(2024, 0, 1));
    assert.match(updates[0].embeds[0].toJSON().description, new RegExp(`• Done 1 · <t:${Math.floor(oldest.getTime() / 1000)}:d>`));
    await opened.message.handlers.end();
    const ended = opened.edits[0].components[0].toJSON().components;
    assert.equal(ended.every((button) => button.disabled), true);

    const done = [];
    await watchingCommand.execute({
        user: { id: OWNER, username: 'Owner' },
        member: null,
        options: {
            getSubcommand: () => 'complete',
            getString: () => '40',
            getUser: () => null,
        },
        reply: async (body) => done.push(body),
    });
    assert.match(done[0].content, /Marked \*\*Cowboy Bebop\*\* completed/);
    let saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.watchingList.length, 0);
    assert.equal(saved.watching, 'Keep me');
    assert.equal(saved.completedList.some((item) => item.anilistId === '40'), true);
    assert.ok(saved.completedList.find((item) => item.anilistId === '40').completedAt);

    const removeChoices = [];
    await completedCommand.autocomplete({
        user: { id: OWNER },
        options: {
            getSubcommand: () => 'remove',
            getFocused: () => ({ value: 'bebop' }),
        },
        respond: async (found) => removeChoices.push(...found),
    });
    assert.equal(removeChoices.some((choice) => choice.value === '40'), true);

    const removed = [];
    await completedCommand.execute({
        user: { id: OWNER, username: 'Owner' },
        member: null,
        options: {
            getSubcommand: () => 'remove',
            getString: () => '40',
            getUser: () => null,
        },
        reply: async (body) => removed.push(body),
    });
    assert.match(removed[0].content, /Removed \*\*Cowboy Bebop\*\*/);
    assert.deepEqual(removed[0].allowedMentions.parse, []);
    saved = await AnimeProfile.findOne({ userId: OWNER });
    assert.equal(saved.completedList.some((item) => item.anilistId === '40'), false);
    assert.equal(saved.completedList.length, 11);
    assert.equal(saved.watching, 'Keep me');
});
