const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const cards = require('../src/utils/cards');

function solidAvatar(color) {
    const canvas = createCanvas(64, 64);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);
    return canvas;
}

function assertPng(png) {
    assert.ok(Buffer.isBuffer(png));
    assert.equal(png[0], 0x89);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), cards.CARD_WIDTH);
    assert.equal(png.readUInt32BE(20), cards.CARD_HEIGHT);
    assert.ok(png.length > 500);
}

async function pixel(png, x, y) {
    const image = await loadImage(png);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(x, y, 1, 1).data;
}

test('the level jump label is the old level then the new level', () => {
    assert.equal(cards.levelUpLabel(3, 5), '3 → 5');
    assert.equal(cards.levelUpLabel(0, 1), '0 → 1');
});

test('a rank card is a small png with the avatar cropped on the right', async () => {
    const png = await cards.renderRankCard({
        displayName: 'Reno',
        level: 4,
        rank: 2,
        current: 40,
        needed: 100,
        avatarImage: solidAvatar('#ff0000'),
    });
    assertPng(png);

    const center = cards.avatarCenter();
    const middle = await pixel(png, center.x, center.y);
    assert.ok(middle[0] > 200 && middle[1] < 40 && middle[2] < 40);

    const cornerX = Math.round(center.x - (cards.AVATAR_DIAMETER / 2));
    const cornerY = Math.round(center.y - (cards.AVATAR_DIAMETER / 2));
    const corner = await pixel(png, cornerX, cornerY);
    assert.ok(corner[0] < 80 && corner[1] < 80);
});

test('a level-up card is a png in the same size', async () => {
    const png = await cards.renderLevelUpCard({
        displayName: 'Reno',
        from: 3,
        to: 5,
        current: 10,
        needed: 1100,
        avatarImage: solidAvatar('#00aa44'),
    });
    assertPng(png);
    const center = cards.avatarCenter();
    const middle = await pixel(png, center.x, center.y);
    assert.ok(middle[1] > 100 && middle[0] < 80);
});

test('a missing avatar rejects so the caller can fall back', async () => {
    await assert.rejects(() => cards.renderRankCard({
        displayName: 'Reno',
        level: 1,
        rank: 1,
        current: 1,
        needed: 100,
    }));
    await assert.rejects(() => cards.renderLevelUpCard({
        displayName: 'Reno',
        from: 3,
        to: 5,
        current: 0,
        needed: 100,
        avatarURL: 'file:///etc/passwd',
    }));
});
