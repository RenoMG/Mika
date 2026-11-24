const { randomUUID } = require('node:crypto');
const Mute = require('../Models/Mute');
const { redact } = require('./redact');
async function locked(guildId, userId, work) {
    const key = { guildId, userId };
    try { await Mute.updateOne(key, { $setOnInsert: { roleIds: [] } }, { upsert: true }); }
    catch (error) { if (error.code !== 11000) throw error; }
    const token = randomUUID();
    const doc = await Mute.findOneAndUpdate({ ...key, $or: [
        { lockUntil: { $exists: false } }, { lockUntil: { $lte: new Date() } },
    ] }, { $set: { lockUntil: new Date(Date.now() + 120000), lockToken: token } }, { returnDocument: 'after' });
    if (!doc) throw new Error('This member already has a mute change in progress. Try again.');
    try { return await work(doc); }
    finally { await Mute.updateOne({ ...key, lockToken: token }, { $unset: { lockUntil: 1, lockToken: 1 } }); }
}
async function applyMute(member, roleId, duration) {
    return locked(member.guild.id, member.id, async (doc) => {
        const previous = { roleIds: doc.roleIds.slice(), expiresAt: doc.expiresAt };
        doc.roleIds = [...new Set([...doc.roleIds, roleId])];
        doc.expiresAt = duration ? new Date(Date.now() + duration) : null;
        // Persist before Discord: an interruption cannot lose the expiry.
        await doc.save();
        try { await member.roles.add(roleId); }
        catch (error) {
            if (error.code === 50013 || error.code === 10011) {
                await Mute.updateOne({ _id: doc._id, lockToken: doc.lockToken }, { $set: previous });
            }
            throw error;
        }
    });
}
async function clearMute(member, configuredRoleId, { expiredOnly = false } = {}) {
    return locked(member.guild.id, member.id, async (doc) => {
        if (expiredOnly && (!doc.expiresAt || doc.expiresAt.getTime() > Date.now())) return;
        const ids = [...new Set([...doc.roleIds, configuredRoleId].filter(Boolean))];
        for (const id of ids) {
            if (member.roles.cache.has(id)) await member.roles.remove(id);
        }
        await Mute.updateOne({ _id: doc._id, lockToken: doc.lockToken }, { $set: { roleIds: [], expiresAt: null } });
    });
}
function startMuteScheduler(client) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            const guilds = [...client.guilds.cache.keys()];
            const due = await Mute.find({ guildId: { $in: guilds }, expiresAt: { $ne: null, $lte: new Date() } }).limit(100).lean();
            for (const doc of due) {
                try {
                    const member = await client.guilds.cache.get(doc.guildId).members.fetch(doc.userId);
                    await clearMute(member, null, { expiredOnly: true });
                } catch (error) { console.error('Mute expiry failed.', redact(error)); }
            }
        } catch (error) { console.error('Mute scheduler failed.', redact(error)); }
        finally { running = false; }
    };
    const timer = setInterval(tick, 15000);
    timer.unref();
    void tick();
    return () => clearInterval(timer);
}
module.exports = { applyMute, clearMute, startMuteScheduler };
