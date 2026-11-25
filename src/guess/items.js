// Shop items: things a player buys and holds in their inventory. Hints,
// packs and wagers are paid for during a round, so they are not items.
const HOUR_MS = 60 * 60 * 1000;

const ITEMS = Object.freeze({
    shield: {
        name: 'Streak Shield', short: 'Shield', emoji: '🛡️', cost: 75, max: 1,
        text: 'Saves your streak once when you lose or give up. Used automatically.',
    },
    boostHour: {
        name: '1-hour Boost', short: '1-hour', emoji: '⚡', cost: 150, max: 3, durationMs: HOUR_MS, rounds: 10,
        text: 'Doubles crystals from your `/guess play` rounds for 1 hour.',
    },
    boostDay: {
        name: '24-hour Boost', short: '24-hour', emoji: '🌟', cost: 600, max: 3, durationMs: 24 * HOUR_MS, rounds: 60,
        text: 'Doubles crystals from your `/guess play` rounds for 24 hours, up to 60 rounds.',
    },
});

const BOOSTS = ['boostHour', 'boostDay'];

function itemOf(id) {
    return typeof id === 'string' && Object.hasOwn(ITEMS, id) ? { id, ...ITEMS[id] } : null;
}

module.exports = { ITEMS, BOOSTS, itemOf };
