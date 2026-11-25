// Built-in level-up text. Stored config stays blank until a server sets its own,
// so /config info can tell "still the default" from a saved custom message.
const DEFAULT_LEVEL_MESSAGE = '🎉 {user} reached **level {level}**!';

// Greeting and farewell defaults are stored on the guild document. These match
// ConfigurationDB so a blank saved message can still be labeled and sent.
const DEFAULT_GREETING_MESSAGE = 'Welcome to the server {userd}!';
const DEFAULT_FAREWELL_MESSAGE = 'Sorry to see you go {userd}!';

// Whole tokens only, so {user} does not eat the start of {userd}. One pass:
// replacement text is not scanned again, and unknown tokens stay as written.
const PLACEHOLDER = /\{([a-z0-9_]+)\}/gi;

function formatMessage(template, values) {
    const source = template == null ? '' : String(template);
    const lookup = Object.create(null);
    if (values && typeof values === 'object') {
        for (const key of Object.keys(values)) {
            const value = values[key];
            if (value == null) continue;
            lookup[String(key).toLowerCase()] = String(value);
        }
    }
    return source.replace(PLACEHOLDER, (match, key) => {
        const replacement = lookup[String(key).toLowerCase()];
        return replacement == null ? match : replacement;
    });
}

// The whole message option, not a sentence that happens to contain the word.
function isDefaultRequest(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'default';
}

function storedMessage(list, fallback) {
    if (!Array.isArray(list) || !list.length) return fallback;
    const raw = `${list.map((entry) => (entry ? entry.Message : ''))}`;
    return raw.trim() ? raw : fallback;
}

// {user} is the mention. {userd} is the guild display name (nickname, otherwise username).
function memberValues(member) {
    const user = member && member.user ? member.user : {};
    const userd = (member && member.displayName) || user.globalName || user.username || 'someone';
    return {
        user: user.id ? `<@${user.id}>` : userd,
        userd,
    };
}

module.exports = {
    DEFAULT_LEVEL_MESSAGE,
    DEFAULT_GREETING_MESSAGE,
    DEFAULT_FAREWELL_MESSAGE,
    formatMessage,
    isDefaultRequest,
    memberValues,
    storedMessage,
};
