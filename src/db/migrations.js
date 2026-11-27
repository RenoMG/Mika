const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
function models() {
    require('../levels');
    return [require('../Models/ConfigurationDB'), require('../Models/WarnDB'), require('../Models/InfractionsDB'),
        mongoose.model('Levels'), require('../Models/Mute'), require('../Models/GuessPlayer'), require('../Models/GuessGuild'),
        require('../Models/ProfileLink'), require('../Models/LinkCode'), require('../Models/BlogWatch'),
        require('../Models/NewsWatch'), require('../Models/ReleaseWatch')];
}
async function inspect() {
    const problems = [];
    for (const Model of models()) {
        for (const [keys, options] of Model.schema.indexes()) {
            if (!options.unique) continue;
            const id = Object.fromEntries(Object.keys(keys).map((key) => [key, `$${key}`]));
            const duplicates = await Model.collection.aggregate([
                { $group: { _id: id, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 100 },
            ]).toArray();
            if (duplicates.length) problems.push({ collection: Model.collection.name, keys, duplicates });
        }
    }
    return problems;
}
function sameWarning(a, b) {
    return ['ExecuterID', 'ExecuterTag', 'Reason', 'Date'].every((key) => a[key] === b[key]);
}
async function migrate() {
    const problems = await inspect();
    if (problems.length) throw new Error('Duplicate natural keys exist. Run db:check, reconcile the reported records, then retry. No records were changed.');
    const Warn = require('../Models/WarnDB');
    const Infra = require('../Models/InfractionsDB');
    // Warnings used to be kept twice: WarnDB held the "active" list and
    // InfractionsDB the history. InfractionsDB is now the only record, so any
    // warning only WarnDB still holds is copied over, then the WarnDB row goes.
    for await (const doc of Warn.collection.find({})) {
        const history = await Infra.collection.findOne({ GuildID: doc.GuildID, UserID: doc.UserID });
        const events = history?.Warns || [];
        const used = new Set();
        const missing = [];
        for (const entry of events) entry.warningId ||= randomUUID();
        for (const entry of (doc.Content || []).slice().reverse()) {
            let match = -1;
            for (let index = events.length - 1; index >= 0; index -= 1) {
                if (!used.has(index) && (entry.warningId ? entry.warningId === events[index].warningId : sameWarning(entry, events[index]))) { match = index; break; }
            }
            if (match >= 0) used.add(match);
            else missing.unshift({ ...entry, warningId: entry.warningId || randomUUID() });
        }
        events.push(...missing);
        await Infra.collection.updateOne(
            { GuildID: doc.GuildID, UserID: doc.UserID },
            { $set: { Warns: events }, $setOnInsert: { UserTag: doc.UserTag || `<@!${doc.UserID}>`, Mutes: [], Kicks: [], Bans: [] } },
            { upsert: true },
        );
        await Warn.collection.deleteOne({ _id: doc._id });
    }
    // Every record gets a stable id, so removing one from a menu always finds it.
    for await (const doc of Infra.collection.find({})) {
        const set = {};
        for (const key of Infra.arrayKeys) {
            const list = Array.isArray(doc[key]) ? doc[key] : [];
            if (list.some((entry) => entry && !entry.warningId)) {
                set[key] = list.map((entry) => (entry && !entry.warningId ? { ...entry, warningId: randomUUID() } : entry));
            }
        }
        if (Object.keys(set).length) await Infra.collection.updateOne({ _id: doc._id }, { $set: set });
    }
    for (const Model of models()) await Model.createIndexes();
}
async function verifyIndexes() {
    for (const Model of models()) {
        let indexes;
        try { indexes = await Model.collection.indexes(); } catch { indexes = []; }
        for (const [keys, options] of Model.schema.indexes()) {
            if (!options.unique) continue;
            if (!indexes.some((index) => index.unique && JSON.stringify(index.key) === JSON.stringify(keys))) {
                throw new Error(`Missing safety index on ${Model.collection.name}. Stop the bot and run npm run db:migrate before starting this version.`);
            }
        }
    }
}
module.exports = { inspect, migrate, verifyIndexes, sameWarning };
