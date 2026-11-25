const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MessageFlags } = require('discord.js');
const board = require('../src/utils/leaderboard');

function entry(position, xp) {
    return {
        userID: `user-${position}`,
        position,
        username: `User${position}`,
        discriminator: '0',
        level: position,
        xp,
        departed: false,
    };
}

test('pagination stays within the top 50, ten per page', () => {
    assert.equal(board.LEADERBOARD_LIMIT, 50);
    assert.equal(board.PAGE_SIZE, 10);
    assert.equal(board.LEADERBOARD_TIMEOUT_MS, 120000);
    assert.equal(board.pageCount(0), 0);
    assert.equal(board.pageCount(1), 1);
    assert.equal(board.pageCount(10), 1);
    assert.equal(board.pageCount(11), 2);
    assert.equal(board.pageCount(50), 5);
    assert.equal(board.pageCount(80), 5);

    const extra = Array.from({ length: 51 }, (_, index) => ({ userID: `id-${index}` }));
    const window = board.leaderboardWindow(extra);
    assert.equal(window.rows.length, 50);
    assert.equal(window.more, true);
    assert.equal(board.leaderboardWindow(extra.slice(0, 12)).more, false);
});

test('rank marks use gold, silver, bronze, then code-styled numbers', () => {
    assert.equal(board.rankMark(1), '🥇');
    assert.equal(board.rankMark(2), '🥈');
    assert.equal(board.rankMark(3), '🥉');
    assert.equal(board.rankMark(4), '`#4`');
    assert.equal(board.rankMark(50), '`#50`');
});

test('the footer says when the board is shorter than 50, and buttons stop at the ends', () => {
    const entries = Array.from({ length: 12 }, (_, index) => entry(index + 1, 100 - index));
    entries[1].departed = true;
    entries[1].username = 'Unknown user';

    const first = board.buildLeaderboardView({ guildName: 'Server', entries, more: false, page: 0 });
    const data = first.embeds[0].data;
    assert.equal(data.title, '🏆 Server leaderboard');
    assert.match(data.description, /^🥇 User1 · Level \*\*1\*\* · 100 XP/);
    assert.match(data.description, /🥈 \*Former member\* · Level \*\*2\*\* · 99 XP/);
    assert.match(data.footer.text, /12 members · Page 1 of 2/);
    const open = first.components[0].toJSON().components;
    assert.equal(open[0].disabled, true);
    assert.equal(open[1].disabled, false);

    const last = board.buildLeaderboardView({ guildName: 'Server', entries, more: false, page: 1 });
    assert.match(last.embeds[0].data.description, /`#11` User11/);
    assert.match(last.embeds[0].data.description, /`#12` User12/);
    assert.doesNotMatch(last.embeds[0].data.description, /🥇/);
    const end = last.components[0].toJSON().components;
    assert.equal(end[0].disabled, false);
    assert.equal(end[1].disabled, true);

    const top = Array.from({ length: 50 }, (_, index) => entry(index + 1, 500 - index));
    const topView = board.buildLeaderboardView({ guildName: 'Server', entries: top, more: true, page: 4 });
    assert.match(topView.embeds[0].data.footer.text, /Top 50 · Page 5 of 5/);
    assert.match(topView.embeds[0].data.description, /`#50` User50 · Level \*\*50\*\* · 451 XP/);
    assert.doesNotMatch(topView.embeds[0].data.description, /🥇/);
    const topButtons = topView.components[0].toJSON().components;
    assert.equal(topButtons[0].disabled, false);
    assert.equal(topButtons[1].disabled, true);

    const timedOut = board.buildLeaderboardView({ guildName: 'Server', entries: top, more: true, page: 2, disabled: true });
    const disabled = timedOut.components[0].toJSON().components;
    assert.equal(disabled[0].disabled, true);
    assert.equal(disabled[1].disabled, true);

    const empty = board.buildLeaderboardView({ guildName: 'Server', entries: [], page: 0 });
    assert.match(empty.embeds[0].data.description, /Nobody has earned XP yet/);
    assert.equal(empty.embeds[0].data.footer.text, 'Mika · 🏆 Leaderboard');
    assert.equal(empty.components.length, 0);

    const one = board.buildLeaderboardView({
        guildName: 'Server',
        entries: [entry(1, 5)],
        more: false,
        page: 0,
    });
    assert.match(one.embeds[0].data.footer.text, /1 member$/);
});

test('clicks move one page and ignore everyone except the command user', async () => {
    const entries = Array.from({ length: 12 }, (_, index) => entry(index + 1, 100 - index));
    const state = { ownerId: 'owner', guildName: 'Server', entries, more: false, page: 0 };
    assert.equal(board.applyLeaderboardClick(0, 2, board.PREV_ID), 0);
    assert.equal(board.applyLeaderboardClick(0, 2, board.NEXT_ID), 1);
    assert.equal(board.applyLeaderboardClick(1, 2, board.NEXT_ID), 1);

    const denied = [];
    const stayed = await board.onLeaderboardClick({
        user: { id: 'other' },
        customId: board.NEXT_ID,
        reply: async (body) => denied.push(body),
        update: async () => { throw new Error('should not update'); },
    }, state);
    assert.equal(stayed.page, 0);
    assert.equal(denied[0].content, board.ONLY_OWNER);
    assert.equal(denied[0].flags, MessageFlags.Ephemeral);

    const updates = [];
    const next = await board.onLeaderboardClick({
        user: { id: 'owner' },
        customId: board.NEXT_ID,
        update: async (body) => updates.push(body),
    }, state);
    assert.equal(next.page, 1);
    assert.match(updates[0].embeds[0].data.footer.text, /Page 2 of 2/);
    const back = await board.onLeaderboardClick({
        user: { id: 'owner' },
        customId: board.PREV_ID,
        update: async (body) => updates.push(body),
    }, next);
    assert.equal(back.page, 0);
});
