const { GUESS_PLAY_LIMIT, GUESS_PLAY_WINDOW_MS } = require('./constants');

function judgePlays(stamps, now, limit = GUESS_PLAY_LIMIT, windowMs = GUESS_PLAY_WINDOW_MS) {
    const recent = [];
    for (const stamp of stamps || []) {
        const time = Number(stamp);
        if (!Number.isFinite(time)) continue;
        if (now >= time && now - time < windowMs) recent.push(time);
    }
    recent.sort((a, b) => a - b);
    if (recent.length >= limit) {
        const index = recent.length - limit;
        return {
            allowed: false,
            nextAt: recent[index] + windowMs,
            plays: recent.slice(-limit),
        };
    }
    return { allowed: true, plays: recent };
}

function limitMessage(nextAt, limit = GUESS_PLAY_LIMIT) {
    const unix = Math.ceil(Number(nextAt) / 1000);
    return `⏳ You've played all ${limit} rounds this hour. Your next round opens <t:${unix}:R> (<t:${unix}:t>).`;
}

module.exports = {
    judgePlays,
    limitMessage,
};
