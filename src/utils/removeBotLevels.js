const mongoose = require('mongoose');

// Registers the Levels model on this mongoose instance. Does not connect.
require('../levels');

// Deletes level documents only when Discord says that user is a bot.
// A failed fetch, a null user, or a departed member is left alone.
// Pass dryRun: false to delete. The default only reports.
async function removeBotLevelDocs(client, { dryRun = true } = {}) {
    if (!client || !client.users || typeof client.users.fetch !== 'function') {
        throw new TypeError('A client that can fetch users was not provided.');
    }

    const Level = mongoose.model('Levels');
    const ids = (await Level.distinct('userID')).filter((id) => typeof id === 'string' && id);
    const botIds = [];

    for (const id of ids) {
        let user = null;
        try {
            user = await client.users.fetch(id);
        } catch (error) {
            continue;
        }
        if (user && user.bot === true) botIds.push(id);
    }

    const documents = botIds.length
        ? await Level.countDocuments({ userID: { $in: botIds } })
        : 0;

    let deleted = 0;
    if (!dryRun && botIds.length) {
        const result = await Level.deleteMany({ userID: { $in: botIds } });
        deleted = result && result.deletedCount ? result.deletedCount : 0;
    }

    return {
        checked: ids.length,
        bots: botIds.length,
        documents,
        deleted,
        ids: botIds,
        dryRun: dryRun !== false,
    };
}

module.exports = { removeBotLevelDocs };
