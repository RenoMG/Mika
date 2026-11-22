const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags } = require('discord.js');

process.env.MIKAICON = process.env.MIKAICON || 'https://example.com/mika.png';

const image = require('../src/commands/image/image');
const info = require('../src/commands/configuration/handlers/info');

function jsonResponse(body, ok = true) {
    return {
        ok,
        status: ok ? 200 : 500,
        json: async () => body,
    };
}

test('image commands use the live keyless hosts and a short timeout', () => {
    assert.equal(image.IMAGE_TIMEOUT_MS, 8000);
    assert.equal(image.SOURCES.shibe.url, 'https://dog.ceo/api/breed/shiba/images/random');
    assert.equal(image.SOURCES.bird.url, 'https://some-random-api.com/animal/bird');
    assert.equal(image.SOURCES.cat.url, 'https://api.thecatapi.com/v1/images/search');
    assert.equal(image.SOURCES.dog.url, 'https://dog.ceo/api/breeds/image/random');
    assert.equal(image.SOURCES.duck.url, 'https://random-d.uk/api/v2/random?format=json');
    assert.equal(image.SOURCES.fox.url, 'https://randomfox.ca/floof/');
    for (const source of Object.values(image.SOURCES)) {
        assert.equal(source.url.includes('shibe.online'), false);
    }
    const names = image.data.toJSON().options.map((option) => option.name);
    assert.deepEqual(names, ['shibe', 'bird', 'cat', 'dog', 'duck', 'fox']);
});

test('each image command replies with the picture, and duck is https', async () => {
    const original = global.fetch;
    global.fetch = async (url) => {
        const target = String(url);
        if (target.includes('/shiba/')) return jsonResponse({ message: 'https://images.dog.ceo/breeds/shiba/shiba-1.jpg', status: 'success' });
        if (target.includes('/animal/bird')) return jsonResponse({ image: 'https://i.imgur.com/bird.jpg' });
        if (target.includes('thecatapi.com')) return jsonResponse([{ url: 'https://cdn2.thecatapi.com/images/cat.jpg' }]);
        if (target.includes('/breeds/image/')) return jsonResponse({ message: 'https://images.dog.ceo/breeds/hound/dog.jpg', status: 'success' });
        if (target.includes('random-d.uk')) return jsonResponse({ url: 'http://random-d.uk/api/1.JPG' });
        if (target.includes('randomfox.ca')) return jsonResponse({ image: 'https://randomfox.ca/images/1.jpg' });
        throw new Error(`unexpected ${target}`);
    };
    try {
        const expected = {
            shibe: 'https://images.dog.ceo/breeds/shiba/shiba-1.jpg',
            bird: 'https://i.imgur.com/bird.jpg',
            cat: 'https://cdn2.thecatapi.com/images/cat.jpg',
            dog: 'https://images.dog.ceo/breeds/hound/dog.jpg',
            duck: 'https://random-d.uk/api/1.JPG',
            fox: 'https://randomfox.ca/images/1.jpg',
        };
        for (const [name, url] of Object.entries(expected)) {
            const replies = [];
            await image.execute({
                options: { getSubcommand: () => name },
                reply: async (body) => replies.push(body),
            });
            assert.equal(replies[0].embeds[0].data.image.url, url, name);
            assert.match(replies[0].embeds[0].data.footer.text, /^Mika \| /);
        }
    } finally {
        global.fetch = original;
    }
});

test('a dead image API replies instead of throwing', async () => {
    const original = global.fetch;
    global.fetch = async () => {
        throw new Error('down');
    };
    try {
        for (const name of ['shibe', 'bird', 'cat', 'dog', 'duck', 'fox']) {
            const replies = [];
            await image.execute({
                options: { getSubcommand: () => name },
                reply: async (body) => replies.push(body),
            });
            assert.equal(replies.length, 1, name);
            assert.equal(replies[0].content, image.IMAGE_ERROR);
            assert.equal(replies[0].flags, MessageFlags.Ephemeral);
        }
    } finally {
        global.fetch = original;
    }
});

test('config info uses a section menu, a home button, and the standard footer', async () => {
    const home = info.buildConfigInfoView({}, null);
    assert.equal(home.embeds[0].data.footer.text, info.FOOTER);
    assert.equal(home.embeds[0].data.footer.text, 'Mika | 🖥️ config');
    assert.match(home.embeds[0].data.description, /\*\*Welcome\*\*/);
    assert.match(home.embeds[0].data.description, /\*\*Leveling\*\*/);
    assert.equal(JSON.stringify(home).includes('Made with Love'), false);

    const select = home.components[0].toJSON().components[0];
    assert.equal(select.options.length, info.CONFIG_SECTIONS.length);
    assert.deepEqual(select.options.map((option) => option.value), info.CONFIG_SECTIONS.map((section) => section.id));
    assert.equal(home.components[1].toJSON().components[0].label, 'Home');
    assert.equal(info.CONFIG_TIMEOUT_MS, 120000);

    const leveling = info.buildConfigInfoView({}, 'leveling');
    assert.equal(leveling.embeds[0].data.description, 'Leveling config');
    assert.equal(leveling.embeds[0].data.footer.text, 'Mika | 🖥️ config');
    assert.equal(leveling.components[0].toJSON().components[0].options.find((option) => option.value === 'leveling').default, true);

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

    assert.equal(replies[0].embeds[0].data.title, 'SERVER CONFIGURATION');
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
    assert.equal(updates[0].embeds[0].data.description, 'Welcome config');

    await collector.handlers.collect({
        user: { id: 'owner' },
        customId: 'configinfo:home',
        update: async (body) => updates.push(body),
    });
    assert.match(updates[1].embeds[0].data.description, /Pick a section/);

    await collector.handlers.end();
    assert.equal(edits[0].components[0].toJSON().components[0].disabled, true);
    assert.equal(edits[0].components[1].toJSON().components[0].disabled, true);
    assert.equal(edits[0].embeds[0].data.footer.text, 'Mika | 🖥️ config');
});
