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
const UNKNOWN_MEMBER = 10007;

async function expireAbsent(doc) {
    await Mute.updateOne(
        { _id: doc._id, expiresAt: { $ne: null, $lte: new Date() }, $or: [{ lockUntil: { $exists: false } }, { lockUntil: { $lte: new Date() } }] },
        { $set: { roleIds: [], expiresAt: null } },
    );
}

// Leaving and rejoining must not shed a mute. Roles the bot can still assign
// are put back; an expired mute is closed instead.
async function restoreMute(member) {
    const doc = await Mute.findOne({ guildId: member.guild.id, userId: member.id, 'roleIds.0': { $exists: true } }).lean();
    if (!doc) return [];
    if (doc.expiresAt && doc.expiresAt.getTime() <= Date.now()) {
        await expireAbsent(doc);
        return [];
    }
    const me = member.guild.members.me;
    const top = me && me.roles && me.roles.highest ? me.roles.highest.position : 0;
    const ids = doc.roleIds.filter((id) => {
        const role = member.guild.roles.cache.get(id);
        return role && !role.managed && role.position < top;
    });
    if (ids.length) await member.roles.add(ids, 'Mute still active after rejoining');
    return ids;
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
                    const member = await client.guilds.cache.get(doc.guildId).members.fetch(doc.userId).catch((error) => {
                        if (error?.code === UNKNOWN_MEMBER) return null;
                        throw error;
                    });
                    // A member who left has no roles to remove. Close the record so it
                    // stops coming back every tick and crowding out other expiries.
                    if (!member) await expireAbsent(doc);
                    else await clearMute(member, null, { expiredOnly: true });
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
module.exports = { applyMute, clearMute, restoreMute, startMuteScheduler };
