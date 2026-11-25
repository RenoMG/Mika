// Achievements are checked after a win, a duel, or a gift. Each is earned once
// per server and pays a one-time crystal bonus. `test` reads a readPlayer() row.
const ACHIEVEMENTS = Object.freeze([
    { id: 'first_win', emoji: '🌱', name: 'First Steps', text: 'Win your first round.', reward: 25, test: (p) => p.wins >= 1 },
    { id: 'wins_10', emoji: '🎯', name: 'Sharp Eye', text: 'Win 10 rounds.', reward: 50, test: (p) => p.wins >= 10 },
    { id: 'wins_50', emoji: '📺', name: 'Binge Watcher', text: 'Win 50 rounds.', reward: 100, test: (p) => p.wins >= 50 },
    { id: 'wins_100', emoji: '🏯', name: 'Otaku', text: 'Win 100 rounds.', reward: 200, test: (p) => p.wins >= 100 },
    { id: 'wins_500', emoji: '👑', name: 'Living Encyclopedia', text: 'Win 500 rounds.', reward: 500, test: (p) => p.wins >= 500 },
    { id: 'streak_5', emoji: '🔥', name: 'On Fire', text: 'Reach a streak of 5.', reward: 50, test: (p) => p.bestStreak >= 5 },
    { id: 'streak_10', emoji: '☄️', name: 'Unstoppable', text: 'Reach a streak of 10.', reward: 150, test: (p) => p.bestStreak >= 10 },
    { id: 'streak_25', emoji: '🌋', name: 'Legendary Run', text: 'Reach a streak of 25.', reward: 400, test: (p) => p.bestStreak >= 25 },
    { id: 'no_hints_25', emoji: '🧠', name: 'No Hints Needed', text: 'Win 25 personal rounds without buying a hint.', reward: 150, test: (p) => p.counters.noHintWins >= 25 },
    { id: 'speed_1', emoji: '⚡', name: 'Speed Demon', text: 'Win a round in under 5 seconds.', reward: 50, test: (p) => p.counters.fastWins >= 1 },
    { id: 'speed_10', emoji: '🌩️', name: 'Lightning Reflexes', text: 'Win 10 rounds in under 5 seconds.', reward: 150, test: (p) => p.counters.fastWins >= 10 },
    { id: 'wager_1', emoji: '🎲', name: 'Risk Taker', text: 'Win a wager.', reward: 25, test: (p) => p.counters.wagerWins >= 1 },
    { id: 'high_roller', emoji: '💰', name: 'High Roller', text: 'Win a wager of 250 💎 or more.', reward: 100, test: (p) => p.counters.bigWagerWins >= 1 },
    { id: 'duel_1', emoji: '⚔️', name: 'Duelist', text: 'Win a duel.', reward: 25, test: (p) => p.counters.duelWins >= 1 },
    { id: 'duel_10', emoji: '🗡️', name: 'Duel Master', text: 'Win 10 duels.', reward: 150, test: (p) => p.counters.duelWins >= 10 },
    { id: 'character_10', emoji: '🎭', name: 'Face Reader', text: 'Win 10 character rounds.', reward: 100, test: (p) => p.counters.characterWins >= 10 },
    { id: 'packs_5', emoji: '🗺️', name: 'Explorer', text: 'Win a round in 5 different packs.', reward: 100, test: (p) => p.packsWon.length >= 5 },
    { id: 'generous', emoji: '🎁', name: 'Generous Soul', text: 'Gift 1,000 💎 in total.', reward: 50, test: (p) => p.counters.giftedTotal >= 1000 },
    { id: 'shielded', emoji: '🛡️', name: 'Saved by the Shield', text: 'Have a Streak Shield save your streak.', reward: 25, test: (p) => p.counters.shieldsUsed >= 1 },
]);

const BY_ID = new Map(ACHIEVEMENTS.map((entry) => [entry.id, entry]));

// Achievements the player qualifies for and does not hold yet.
function pending(player) {
    if (!player) return [];
    const held = new Set(player.achievements || []);
    return ACHIEVEMENTS.filter((entry) => !held.has(entry.id) && entry.test(player));
}

function unlockText(list) {
    if (!list?.length) return '';
    return list.map((entry) => `🏅 **Achievement unlocked:** ${entry.emoji} ${entry.name} (+${entry.reward} 💎)`).join('\n');
}

module.exports = { ACHIEVEMENTS, BY_ID, pending, unlockText };
