const { snowflake } = require('./safeId');

// parse is empty, so @everyone, @here, and roles in the text are never pings.
// Only the snowflakes passed in can be mentioned.
function allowedMentions(...ids) {
    const users = [];
    const seen = new Set();
    for (const id of ids.flat()) {
        const text = snowflake(id);
        if (!text || seen.has(text)) continue;
        seen.add(text);
        users.push(text);
        if (users.length >= 100) break;
    }
    return { parse: [], users, roles: [], repliedUser: false };
}

module.exports = { allowedMentions };
