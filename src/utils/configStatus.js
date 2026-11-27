// The one place that reads guild settings. Stored settings are legacy one-entry
// lists such as GuessStatus: [{ Status: 'true' }], so every reader goes through
// these helpers instead of parsing the shape itself.

function entries(config, key) {
    const list = config ? config[key] : null;
    return Array.isArray(list) ? list : [];
}

// The first non-empty value of one property, or ''.
function firstValue(config, key, property) {
    for (const entry of entries(config, key)) {
        const value = entry ? entry[property] : undefined;
        if (value != null && String(value).trim()) return String(value);
    }
    return '';
}

// Every non-empty value of one property.
function allValues(config, key, property) {
    return entries(config, key)
        .map((entry) => (entry ? entry[property] : undefined))
        .filter((value) => value != null && value !== '')
        .map(String);
}

// The raw status text. Legacy documents compare the joined list, so a list of
// two statuses is neither on nor off.
function statusOf(config, key) {
    return `${entries(config, key).map((entry) => (entry ? entry.Status : undefined))}`;
}

function isOn(config, key) {
    return statusOf(config, key) === 'true';
}

// Category toggles default to on: only an explicit 'false' turns them off, so a
// guild document saved before a toggle existed keeps the feature running.
function isOff(config, key) {
    return statusOf(config, key) === 'false';
}

module.exports = { firstValue, allValues, statusOf, isOn, isOff };
