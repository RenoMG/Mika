const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const info = require('../src/commands/configuration/handlers/info');

test('config info uses a section menu, a home button, and the standard footer', async () => {
    const home = info.buildConfigInfoView({}, null);
    assert.equal(home.embeds[0].data.footer.text, info.FOOTER);
    assert.equal(home.embeds[0].data.footer.text, 'Mika · ⚙️ Config');
    assert.match(home.embeds[0].data.description, /\*\*Welcome\*\*/);
    assert.match(home.embeds[0].data.description, /\*\*Leveling\*\*/);
    assert.equal(JSON.stringify(home).includes('Made with Love'), false);

    const select = home.components[0].toJSON().components[0];
    assert.equal(select.options.length, info.CONFIG_SECTIONS.length);
    assert.deepEqual(select.options.map((option) => option.value), info.CONFIG_SECTIONS.map((section) => section.id));
    assert.equal(home.components[1].toJSON().components[0].label, 'Home');
    assert.equal(info.CONFIG_TIMEOUT_MS, 120000);

    const leveling = info.buildConfigInfoView({}, 'leveling');
    assert.equal(leveling.embeds[0].data.title, '🏆 Leveling');
    assert.equal(leveling.embeds[0].data.footer.text, 'Mika · ⚙️ Config');
    assert.equal(leveling.components[0].toJSON().components[0].options.find((option) => option.value === 'leveling').default, true);

    const commands = info.buildConfigInfoView({
        ModerationCommandStatus: [{ Status: 'true' }],
        MemeCommandStatus: [{ Status: 'true' }],
        InfoCommandStatus: [{ Status: 'true' }],
        DisabledChannels: [],
    }, 'commands');
    assert.deepEqual(
        commands.embeds[0].data.fields.map((field) => field.name),
        ['Moderation', 'Anime lookups', 'Memes', 'Guess That Anime', 'Information', 'Restricted channels'],
    );

    const closed = info.buildConfigInfoView({}, 'logging', { disabled: true });
    assert.equal(closed.components[0].toJSON().components[0].disabled, true);
    assert.equal(closed.components[1].toJSON().components[0].disabled, true);
    assert.deepEqual(info.selectionFrom({ customId: 'configinfo:home' }), { id: null });
    assert.deepEqual(info.selectionFrom({ customId: 'configinfo:section', values: ['autorole'] }), { id: 'autorole' });

    const replies = [];
    const edits = [];
    let collector;
    await info.presentConfigInfo({
        user: { id: 'owner' },
        async reply(body) {
            replies.push(body);
            return {
                resource: {
                    message: {
                        createMessageComponentCollector() {
                            const handlers = {};
                            collector = {
                                on(event, handler) {
                                    handlers[event] = handler;
                                    return collector;
                                },
                                handlers,
                            };
                            return collector;
                        },
                    },
                },
            };
        },
        editReply: async (body) => edits.push(body),
    }, {});

    assert.equal(replies[0].embeds[0].data.title, '⚙️ Server configuration');
    const denied = [];
    await collector.handlers.collect({
        user: { id: 'other' },
        customId: 'configinfo:section',
        values: ['welcome'],
        reply: async (body) => denied.push(body),
        update: async () => {
            throw new Error('another person must not change the section');
        },
    });
    assert.equal(denied[0].content, info.ONLY_OWNER);
    assert.equal(denied[0].flags, MessageFlags.Ephemeral);

    const updates = [];
    await collector.handlers.collect({
        user: { id: 'owner' },
        customId: 'configinfo:section',
        values: ['welcome'],
        update: async (body) => updates.push(body),
    });
    assert.equal(updates[0].embeds[0].data.title, '👋 Welcome');

    await collector.handlers.collect({
        user: { id: 'owner' },
        customId: 'configinfo:home',
        update: async (body) => updates.push(body),
    });
    assert.match(updates[1].embeds[0].data.description, /Pick a section/);

    await collector.handlers.end();
    assert.equal(edits[0].components[0].toJSON().components[0].disabled, true);
    assert.equal(edits[0].components[1].toJSON().components[0].disabled, true);
    assert.equal(edits[0].embeds[0].data.footer.text, 'Mika · ⚙️ Config');
});

test('config info shows the guess interval the scheduler actually uses', () => {
    const shown = (minutes) => info.buildConfigInfoView({ GuessInterval: [{ Minutes: String(minutes) }] }, 'guess')
        .embeds[0].data.fields.find((field) => field.name === 'Drop interval').value;
    for (const [minutes, text] of [[10, '10 minutes'], [45, '45 minutes'], [90, '1 hour 30 minutes'], [120, '2 hours'], [1440, '24 hours']]) {
        assert.equal(shown(minutes), `Every **${text}**`);
    }
    for (const minutes of [5, 1441, 'garbage']) assert.equal(shown(minutes), 'Every **10 minutes**');
});
