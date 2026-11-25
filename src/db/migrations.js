const mongoose = require('mongoose');
const { randomUUID } = require('node:crypto');
function models() {
    require('../levels');
    return [require('../Models/ConfigurationDB'), require('../Models/WarnDB'), require('../Models/InfractionsDB'),
        mongoose.model('Levels'), require('../Models/AnimeProfile'), ...Object.values(require('../Models/AnimeRecommend')),
        require('../Models/Mute'), require('../Models/GuessPlayer'), require('../Models/GuessGuild'),
        require('../Models/AnimeFollow'), require('../Models/AnilistLink')];
}
async function inspect() {
    const problems = [];
    for (const Model of models()) {
        for (const [keys, options] of Model.schema.indexes()) {
            if (!options.unique || Object.hasOwn(keys, 'activeKey')) continue;
            const id = Object.fromEntries(Object.keys(keys).map((key) => [key, `$${key}`]));
            const duplicates = await Model.collection.aggregate([
                { $group: { _id: id, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 100 },
            ]).toArray();
            if (duplicates.length) problems.push({ collection: Model.collection.name, keys, duplicates });
        }
    }
    const Pending = require('../Models/AnimeRecommend').PendingRecommendation;
    const duplicates = await Pending.collection.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: { targetId: '$targetId', anilistId: '$anilistId' }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } }, { $limit: 100 },
    ]).toArray();
    if (duplicates.length) problems.push({ collection: Pending.collection.name, duplicates });
    return problems;
}
function sameWarning(a, b) {
    return ['ExecuterID', 'ExecuterTag', 'Reason', 'Date'].every((key) => a[key] === b[key]);
}
async function migrate() {
    const problems = await inspect();
    if (problems.length) throw new Error('Duplicate natural keys exist. Run db:check, reconcile the reported records, then retry. No records were changed.');
    const Pending = require('../Models/AnimeRecommend').PendingRecommendation;
    await Pending.collection.updateMany({ status: 'pending' }, [{ $set: { activeKey: { $concat: ['$targetId', ':', '$anilistId'] } } }]);
    await Pending.collection.updateMany({ status: { $ne: 'pending' } }, { $unset: { activeKey: 1 } });
    const Warn = require('../Models/WarnDB');
    const Infra = require('../Models/InfractionsDB');
    for await (const doc of Warn.collection.find({})) {
        const history = await Infra.collection.findOne({ GuildID: doc.GuildID, UserID: doc.UserID });
        const active = doc.Content || [];
        const events = history?.Warns || [];
        const used = new Set();
        for (const entry of events) entry.warningId ||= randomUUID();
        for (const entry of active.slice().reverse()) {
            let match = -1;
            for (let index = events.length - 1; index >= 0; index -= 1) {
                if (!used.has(index) && (entry.warningId ? entry.warningId === events[index].warningId : sameWarning(entry, events[index]))) { match = index; break; }
            }
            if (match >= 0) { used.add(match); entry.warningId = events[match].warningId; }
            else entry.warningId ||= randomUUID();
        }
        await Warn.collection.updateOne({ _id: doc._id }, { $set: { Content: active } });
        if (history) await Infra.collection.updateOne({ _id: history._id }, { $set: { Warns: events } });
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
