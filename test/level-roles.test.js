const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const OWNER = '100000000000000071';
const ROLE_5 = '223456789012345601';
const ROLE_10 = '223456789012345602';
const ROLE_20 = '223456789012345603';
const RISKY = '223456789012345604';

let mongoose;
let mongod;
let Levels;
let awardMessageXp;
let hub;
let levelRolesLib;
let cards;
let guildCounter = 0;

before(async () => {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mongoose = require('mongoose');
    mongod = await MongoMemoryServer.create({ binary: { version: '7.0.24' }, instance: { args: ['--nounixsocket'] } });
    await mongoose.connect(mongod.getUri(), { dbName: 'mika' });
    Levels = require('../src/levels');
    ({ awardMessageXp } = require('../src/events/leveling'));
    hub = require('../src/commands/configuration/hub/hub');
    levelRolesLib = require('../src/utils/levelRoles');
    cards = require('../src/utils/cards');
}, { timeout: 180000 });

after(async () => {
    if (mongoose) await mongoose.disconnect();
    if (mongod) await mongod.stop();
});

function newGuild() {
    guildCounter += 1;
    return `50000000000000${String(guildCounter).padStart(4, '0')}`;
}

function permissions(...allowed) {
    return { has: (bit) => (Array.isArray(bit) ? bit : [bit]).every((entry) => allowed.includes(entry)) };
}

function role(id, { name = `Role ${id.slice(-2)}`, position = 5, perms = 0n, color = '#2ecc71' } = {}) {
    return {
        id,
        name,
        position,
        managed: false,
        hexColor: color,
        permissions: new PermissionsBitField(perms),
        comparePositionTo: (other) => position - other.position,
    };
}

function guildWith(guildId, roles) {
    return {
        id: guildId,
        ownerId: 'owner',
        roles: { cache: new Map(roles.map((entry) => [entry.id, entry])) },
        members: { me: { id: 'bot', permissions: permissions(PermissionFlagsBits.ManageRoles), roles: { highest: { position: 50 } } } },
        channels: { cache: new Map() },
    };
}

async function saveConfig(guildId, rewards) {
    const { getGuildConfig } = require('../src/utils/getGuildConfig');
    const data = await getGuildConfig(guildId);
    data.LevelingCommandStatus = [{ Status: 'true' }];
    data.LevelRoles = rewards.map(([level, roleId]) => ({ Level: String(level), Role: roleId }));
    data.markModified('LevelingCommandStatus');
    data.markModified('LevelRoles');
    await data.save();
}

function member(held = []) {
    const has = new Set(held);
    const added = [];
    return {
        added,
        displayName: 'Reno',
        roles: {
            cache: { has: (id) => has.has(id) },
            add: async (ids) => {
                for (const id of ids) {
                    has.add(id);
                    added.push(id);
                }
            },
        },
    };
}

function chat(guild, userId, guildMember) {
    const sent = [];
    const channel = { id: 'talk', send: async (body) => { sent.push(body); return body; } };
    return {
        sent,
        message: {
            guild: { ...guild, channels: { cache: new Map([['talk', channel]]), fetch: async () => channel } },
            channel,
            channelId: 'talk',
            member: guildMember,
            author: { id: userId, username: 'Reno', displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png' },
        },
    };
}

// ---------------------------------------------------------------- helpers

test('level roles are sorted, deduplicated, and invalid entries skipped', () => {
    const config = { LevelRoles: [
        { Level: '10', Role: ROLE_10 },
        { Level: '5', Role: ROLE_5 },
        { Level: '5', Role: ROLE_20 },
        { Level: '0', Role: ROLE_20 },
        { Level: 'abc', Role: ROLE_20 },
        { Level: '20', Role: 'not-a-role' },
    ] };
    assert.deepEqual(levelRolesLib.levelRoles(config), [{ level: 5, roleId: ROLE_5 }, { level: 10, roleId: ROLE_10 }]);
    assert.deepEqual(levelRolesLib.earnedRewards(config, 9).map((reward) => reward.level), [5]);
    assert.deepEqual(levelRolesLib.nextReward(config, 5), { level: 10, roleId: ROLE_10 });
    assert.equal(levelRolesLib.nextReward(config, 10), null);
    // Setting a role at a new level moves it; setting a level replaces its old role.
    assert.deepEqual(levelRolesLib.withLevelRole(config, 15, ROLE_5), [{ level: 10, roleId: ROLE_10 }, { level: 15, roleId: ROLE_5 }]);
    assert.deepEqual(levelRolesLib.withLevelRole(config, 10, ROLE_20), [{ level: 5, roleId: ROLE_5 }, { level: 10, roleId: ROLE_20 }]);
    assert.equal(levelRolesLib.parseLevel(' 7 '), 7);
    assert.equal(levelRolesLib.parseLevel('1001'), null);
    assert.equal(levelRolesLib.parseLevel('2.5'), null);
});

// ---------------------------------------------------------------- granting

test('a level-up adds its role and keeps the earlier ones, and the message names it', async () => {
    const guildId = newGuild();
    const guild = guildWith(guildId, [role(ROLE_5, { name: 'Level 5' }), role(ROLE_10, { name: 'Level 10' }), role(ROLE_20)]);
    await saveConfig(guildId, [[5, ROLE_5], [10, ROLE_10], [20, ROLE_20]]);
    const userId = 'roles-user-1';
    const seen = [];
    const original = cards.renderLevelUpCard;
    cards.renderLevelUpCard = async (data) => { seen.push(data); return Buffer.from('png'); };
    try {
        await Levels.appendXp(userId, guildId, 2400); // level 4
        const person = member();
        const first = chat(guild, userId, person);
        const toFive = await awardMessageXp(first.message, { xp: 100, now: 1_000_000 });
        assert.equal(toFive.level, 5);
        assert.deepEqual(toFive.granted, [ROLE_5]);
        assert.deepEqual(person.added, [ROLE_5]);
        assert.match(first.sent[0].content, new RegExp(`New role unlocked: <@&${ROLE_5}>`));
        assert.deepEqual(first.sent[0].allowedMentions.roles, [], 'the role is shown, never pinged');
        assert.deepEqual(seen[0].rewards, [{ name: 'Level 5', color: '#2ecc71' }]);
        assert.equal(seen[0].next.level, 10);

        const second = chat(guild, userId, person);
        const toTen = await awardMessageXp(second.message, { xp: 7500, now: 2_000_000 });
        assert.equal(toTen.level, 10);
        assert.deepEqual(toTen.granted, [ROLE_10]);
        assert.deepEqual(person.added, [ROLE_5, ROLE_10], 'level 5 stays and level 10 stacks on');
    } finally {
        cards.renderLevelUpCard = original;
    }
});

test('members already past a level catch up on their next xp, and unsafe roles are skipped', async () => {
    const guildId = newGuild();
    const guild = guildWith(guildId, [
        role(ROLE_5),
        role(ROLE_10, { position: 60 }), // above the bot
        role(RISKY, { perms: PermissionFlagsBits.Administrator }),
    ]);
    await saveConfig(guildId, [[5, ROLE_5], [6, RISKY], [10, ROLE_10], [12, ROLE_20]]); // ROLE_20 was deleted
    const userId = 'roles-user-2';
    await Levels.appendXp(userId, guildId, 22500); // level 15
    const person = member();
    const scene = chat(guild, userId, person);
    const result = await awardMessageXp(scene.message, { xp: 1, now: 3_000_000 });
    assert.equal(result.leveledUp, false);
    assert.deepEqual(result.granted, [ROLE_5]);
    assert.deepEqual(person.added, [ROLE_5]);
    assert.equal(scene.sent.length, 0, 'catching up is quiet');

    const again = await awardMessageXp(chat(guild, userId, person).message, { xp: 1, now: 4_000_000 });
    assert.deepEqual(again.granted, [], 'held roles are not added twice');
});

test('a failed role add does not stop the level-up', async () => {
    const guildId = newGuild();
    const guild = guildWith(guildId, [role(ROLE_5)]);
    await saveConfig(guildId, [[5, ROLE_5]]);
    const userId = 'roles-user-3';
    await Levels.appendXp(userId, guildId, 2400);
    const person = member();
    person.roles.add = async () => { throw new Error('Missing Permissions'); };
    const scene = chat(guild, userId, person);
    scene.message.author.displayAvatarURL = undefined;
    const originalError = console.error;
    console.error = () => {};
    try {
        const result = await awardMessageXp(scene.message, { xp: 100, now: 5_000_000 });
        assert.equal(result.level, 5);
        assert.deepEqual(result.granted, []);
        assert.equal(result.announced, true);
        assert.doesNotMatch(scene.sent[0].content, /New role/);
    } finally {
        console.error = originalError;
    }
});

// ---------------------------------------------------------------- /config

function click(customId, { guildId, values = [], roles = [], fields } = {}) {
    const replies = [];
    const updates = [];
    const modals = [];
    const guild = guildWith(guildId, roles);
    return {
        customId,
        values,
        user: { id: OWNER },
        member: { id: OWNER, permissions: permissions(PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles), roles: { highest: { position: 20 } } },
        guild,
        roles: new Map(roles.map((entry) => [entry.id, entry])),
        channels: new Map(),
        fields,
        replied: false,
        deferred: false,
        replies,
        updates,
        modals,
        async reply(body) { replies.push(body); this.replied = true; },
        async followUp(body) { replies.push(body); },
        async deferUpdate() { this.deferred = true; },
        async editReply(body) { updates.push(body); },
        async update(body) { updates.push(body); },
        async showModal(modal) { modals.push(modal); },
    };
}

function levelFields(roleId, value) {
    return { fields: new Map([[`level:${roleId}`, { value }]]) };
}

async function stored(guildId) {
    const ConfigurationDB = require('../src/Models/ConfigurationDB');
    return ConfigurationDB.findOne({ GuildID: guildId }).lean();
}

function components(view) {
    return view.components.flatMap((row) => row.toJSON().components);
}

test('/config adds, moves, and removes level roles', async () => {
    const guildId = newGuild();
    const roles = [role(ROLE_5, { name: 'Level 5' }), role(ROLE_10, { name: 'Level 10' })];
    assert.equal(hub.isConfigModalId(`cfg:lrlevel:leveling:roles:${OWNER}`), true);
    assert.equal(hub.isConfigComponentId(`cfg:lrlevel:leveling:roles:${OWNER}`), false);
    assert.equal(hub.isConfigComponentId(`cfg:lradd:leveling:roles:${OWNER}`), true);

    // Picking a role asks for its level.
    const pick = click(`cfg:lradd:leveling:roles:${OWNER}`, { guildId, values: [ROLE_5], roles });
    await hub.handleConfigComponent(pick);
    assert.equal(pick.modals.length, 1);
    const modal = pick.modals[0].toJSON();
    assert.equal(modal.custom_id, `cfg:lrlevel:leveling:roles:${OWNER}`);
    assert.equal(modal.components[0].components[0].custom_id, `level:${ROLE_5}`);
    assert.match(modal.title, /Level 5/);

    await hub.handleConfigModal(click(`cfg:lrlevel:leveling:roles:${OWNER}`, { guildId, roles, fields: levelFields(ROLE_5, '5') }));
    const added = click(`cfg:lrlevel:leveling:roles:${OWNER}`, { guildId, roles, fields: levelFields(ROLE_10, '10') });
    await hub.handleConfigModal(added);
    assert.deepEqual((await stored(guildId)).LevelRoles, [{ Level: '5', Role: ROLE_5 }, { Level: '10', Role: ROLE_10 }]);

    const view = added.updates.at(-1);
    const shown = view.embeds[0].data.fields.find((entry) => entry.name === 'Level roles').value;
    assert.equal(shown, `• **Level 5** → <@&${ROLE_5}>\n• **Level 10** → <@&${ROLE_10}>`);
    assert.ok(view.components.length <= 5);
    const remove = components(view).find((entry) => entry.custom_id === `cfg:lrremove:leveling:roles:${OWNER}`);
    assert.deepEqual(remove.options.map((option) => [option.label, option.description]), [['Level 5', '@Level 5'], ['Level 10', '@Level 10']]);

    // Re-picking a role prefills its level, and a new level moves it.
    const repick = click(`cfg:lradd:leveling:roles:${OWNER}`, { guildId, values: [ROLE_5], roles });
    await hub.handleConfigComponent(repick);
    assert.equal(repick.modals[0].toJSON().components[0].components[0].value, '5');
    await hub.handleConfigModal(click(`cfg:lrlevel:leveling:roles:${OWNER}`, { guildId, roles, fields: levelFields(ROLE_5, '15') }));
    assert.deepEqual((await stored(guildId)).LevelRoles, [{ Level: '10', Role: ROLE_10 }, { Level: '15', Role: ROLE_5 }]);

    const drop = click(`cfg:lrremove:leveling:roles:${OWNER}`, { guildId, values: ['10'], roles });
    await hub.handleConfigComponent(drop);
    assert.deepEqual((await stored(guildId)).LevelRoles, [{ Level: '15', Role: ROLE_5 }]);
});

test('/config refuses bad levels and roles Mika should not give', async () => {
    const guildId = newGuild();
    const roles = [role(ROLE_5), role(RISKY, { perms: PermissionFlagsBits.BanMembers })];

    const bad = click(`cfg:lrlevel:leveling:roles:${OWNER}`, { guildId, roles, fields: levelFields(ROLE_5, 'five') });
    await hub.handleConfigModal(bad);
    assert.equal(bad.replies[0].content, hub.BAD_LEVEL);

    const risky = click(`cfg:lradd:leveling:roles:${OWNER}`, { guildId, values: [RISKY], roles });
    await hub.handleConfigComponent(risky);
    assert.equal(risky.modals.length, 0);
    assert.match(risky.replies[0].content, /must not grant moderation/);
    assert.equal(risky.updates.length, 1, 'the panel is redrawn');

    const gone = click(`cfg:lrlevel:leveling:roles:${OWNER}`, { guildId, roles: [], fields: levelFields(ROLE_10, '3') });
    await hub.handleConfigModal(gone);
    assert.equal(gone.replies[0].content, hub.ROLE_GONE);
    assert.deepEqual((await stored(guildId)).LevelRoles, []);
});

// ---------------------------------------------------------------- cards

test('cards draw with level roles shown', async () => {
    const { createCanvas } = require('@napi-rs/canvas');
    const avatarImage = createCanvas(64, 64);
    const levelUp = await cards.renderLevelUpCard({
        displayName: 'Reno', from: 4, to: 5, current: 0, needed: 1100, avatarImage,
        rewards: [{ name: 'Level 5', color: '#2ecc71' }],
    });
    const rank = await cards.renderRankCard({
        displayName: 'Reno', level: 5, rank: 1, current: 10, needed: 1100, totalXp: 2510, avatarImage,
        next: { level: 10, name: 'Level 10', color: null },
    });
    for (const png of [levelUp, rank]) {
        assert.equal(png.readUInt32BE(16), cards.CARD_WIDTH);
        assert.equal(png.readUInt32BE(20), cards.CARD_HEIGHT);
    }
});
