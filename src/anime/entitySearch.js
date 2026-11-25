// Thin wrapper so commands and tests can swap the provider.
const client = require('./client');

module.exports = {
    searchEntities: (kind, text, options) => client.searchEntities(kind, text, options),
    peekEntities: (kind, text) => client.peekEntities(kind, text),
    anilistQueryWait: () => client.anilistWaitMs(),
};
