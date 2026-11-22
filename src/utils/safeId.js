// Query values are always plain strings. Objects would be Mongo operators.

function storedId(value, label) {
    if (value == null || typeof value === 'object') {
        throw new TypeError(`${label} was not provided.`);
    }
    const text = String(value);
    if (!/^[\w-]{1,64}$/.test(text)) {
        throw new TypeError(`${label} was not provided.`);
    }
    return text;
}

function snowflake(value) {
    if (value == null || typeof value === 'object') return null;
    const text = String(value);
    return /^\d{17,20}$/.test(text) ? text : null;
}

module.exports = { storedId, snowflake };
