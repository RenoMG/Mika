const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PermissionFlagsBits } = require('discord.js');

const { hierarchyBlock, HIERARCHY } = require('../src/utils/hierarchy');
const { allowedMentions } = require('../src/utils/mentions');
const { snowflake, storedId } = require('../src/utils/safeId');
const { reasonFrom } = require('../src/utils/moderation');
const { redact } = require('../src/utils/redact');
const interactionCreate = require('../src/events/interactionCreate');
const guildConfig = require('../src/utils/getGuildConfig');

guildConfig.getGuildConfig = async () => ({
    ModerationCommandStatus: [{ Status: 'true' }],
    DisabledChannels: [],
});

function member(id, position) {
    return { id, roles: { highest: { position } } };
}

test('hierarchy blocks self, the owner, equal roles, and a higher target', () => {
    const guild = { ownerId: 'owner' };
    const bot = member('bot', 10);
    const mod = member('mod', 5);
    const lower = member('lower', 1);
    const peer = member('peer', 5);
    const higher = member('higher', 8);
    const aboveBot = member('above', 12);
    const owner = member('owner', 1);

    assert.equal(hierarchyBlock({ guild, invoker: mod, target: mod, botMember: bot }), HIERARCHY.self);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: owner, botMember: bot }), HIERARCHY.owner);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: bot, botMember: bot }), HIERARCHY.botRole);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: aboveBot, botMember: bot }), HIERARCHY.botRole);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: higher, botMember: bot }), HIERARCHY.invokerRole);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: peer, botMember: bot }), HIERARCHY.invokerRole);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: lower, botMember: bot }), null);
    assert.equal(hierarchyBlock({ guild, invoker: owner, target: higher, botMember: bot }), null);
    assert.equal(hierarchyBlock({ guild, invoker: owner, target: owner, botMember: bot }), HIERARCHY.self);
    assert.equal(hierarchyBlock({ guild, invoker: mod, target: null, botMember: bot }), HIERARCHY.missing);
});

test('the bot role check still applies when the invoker is the owner', () => {
    const guild = { ownerId: 'owner' };
    const bot = member('bot', 3);
    const owner = member('owner', 1);
    const aboveBot = member('staff', 4);
    assert.equal(hierarchyBlock({ guild, invoker: owner, target: aboveBot, botMember: bot }), HIERARCHY.botRole);
});

test('allowedMentions never parses everyone, here, or roles', () => {
    const mentions = allowedMentions('123456789012345678', { $gt: '' }, 'not-an-id', '123456789012345678');
    assert.deepEqual(mentions, {
        parse: [],
        users: ['123456789012345678'],
        roles: [],
        repliedUser: false,
    });
    assert.deepEqual(allowedMentions().parse, []);
    assert.deepEqual(allowedMentions().users, []);
});

test('ids used in queries are strings, and objects are rejected', () => {
    assert.equal(snowflake('123456789012345678'), '123456789012345678');
    assert.equal(snowflake({ $gt: '' }), null);
    assert.equal(snowflake('123'), null);
    assert.equal(storedId('rank-self', 'user'), 'rank-self');
    assert.throws(() => storedId({ $ne: null }, 'user'), TypeError);
    assert.throws(() => storedId('bad$id', 'user'), TypeError);
});

test('reasons are trimmed strings with a 512 character cap', () => {
    assert.equal(reasonFrom('  spamming  ').reason, 'spamming');
    assert.equal(reasonFrom('').error, 'Give a reason.');
    assert.equal(reasonFrom({ $gt: '' }).error, 'Give a reason.');
    assert.match(reasonFrom('x'.repeat(513)).error, /512/);
});

test('logs do not keep a token or a database password', () => {
    const token = 'AAAAAAAAAAAAAAAAAAAAAA.BBBBB.CCCCCCCCCCCCCCCCCCCCCCCCCCC';
    const text = redact(new Error(`login ${token} mongodb+srv://user:secret@host/mika`));
    assert.equal(text.includes(token), false);
    assert.equal(text.includes('secret'), false);
    assert.match(text, /mongodb:\/\/\[redacted\]/);
    assert.match(text, /\[redacted-token\]/);
});

test('mute checks Manage Roles on the bot and Moderate Members on the invoker', async () => {
    const mute = require('../src/commands/moderation/mute');
    const seen = [];
    let executed = false;
    const command = {
        ...mute,
        precheck: null,
        async execute() {
            executed = true;
        },
    };
    const replies = [];
    await interactionCreate.execute({
        isChatInputCommand: () => true,
        commandName: 'mute',
        guild: {
            id: 'guild-1',
            members: {
                me: {
                    permissions: {
                        has(bit) {
                            const bits = Array.isArray(bit) ? bit : [bit];
                            seen.push(...bits.map(String));
                            return bits.every((entry) => entry === PermissionFlagsBits.ManageRoles);
                        },
                    },
                },
            },
        },
        channel: { id: 'talk' },
        member: {
            permissions: {
                has(bit) {
                    const bits = Array.isArray(bit) ? bit : [bit];
                    return bits.every((entry) => entry === PermissionFlagsBits.ModerateMembers);
                },
            },
        },
        reply: async (body) => replies.push(body),
    }, { commands: { get: (name) => (name === 'mute' ? command : undefined) } });
    assert.equal(executed, true);
    assert.equal(replies.length, 0);
    assert.ok(seen.includes(PermissionFlagsBits.ManageRoles.toString()));

    executed = false;
    await interactionCreate.execute({
        isChatInputCommand: () => true,
        commandName: 'mute',
        guild: {
            id: 'guild-1',
            members: {
                me: { permissions: { has: () => false } },
            },
        },
        channel: { id: 'talk' },
        member: { permissions: { has: () => true } },
        reply: async (body) => replies.push(body),
    }, { commands: { get: (name) => (name === 'mute' ? command : undefined) } });
    assert.equal(executed, false);
    assert.match(replies.at(-1).content, /missing a permission I need/);
});
