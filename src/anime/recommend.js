const { deferComponent, updateComponent } = require('../utils/ack');
const crypto = require('crypto');
const { MessageFlags } = require('discord.js');
const AnimeProfile = require('../Models/AnimeProfile');
const { FullListNotice, PendingRecommendation, RecommendGuard } = require('../Models/AnimeRecommend');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');
const { recommendRow } = require('./components');
const { animeEmbed } = require('./embed');
const { anilistId, snowflake } = require('./ids');
const { neutralize } = require('./text');
const { noteIdentity } = require('./profiles');
const { MAX_WATCHING, addWatching, applyWatching, readWatching } = require('./watching');

const COOLDOWN_MS = 5 * 60 * 1000;
const DAILY_CAP = 5;
const BUTTON_RE = /^rec:([ad]):([a-f0-9]{16})$/;

const SELF = "You can't recommend anime to yourself.";
const BOT = "You can't recommend anime to a bot.";
const NOT_IN_SERVER = 'That user is not in this server.';
const NO_PROFILE = "That person hasn't set up an anime profile.";
const RECS_OFF = 'That person has recommendations turned off.';
const DUPLICATE = "You've already recommended that anime to them.";
const COOLDOWN = 'Wait a few minutes before recommending again.';
const DAILY = 'That person has received enough recommendations today.';
const DM_CLOSED = "I couldn't DM them. Ask them to allow DMs from server members. Nothing was sent.";
const SENT = 'Recommendation sent.';
const NOT_YOURS = 'These buttons are not for you.';
const INACTIVE = 'This recommendation is no longer active.';

function plainName(value, max, fallback) {
    return neutralize(value, max) || fallback;
}

function mediaTitle(mediaOrTitle) {
    const titles = mediaOrTitle && mediaOrTitle.titles ? mediaOrTitle.titles : null;
    const rawTitle = titles
        ? (titles.english || titles.romaji || mediaOrTitle.title)
        : mediaOrTitle;
    return plainName(rawTitle, 200, 'an anime');
}

function recommendationDm(senderName, mediaOrTitle, guildName) {
    const who = plainName(senderName, 64, 'Someone');
    const title = mediaTitle(mediaOrTitle);
    const server = neutralize(guildName, 100);
    const from = server ? ` from **${server}**` : '';
    return `✨ **${who}**${from} thinks you'd love **${title}**!\nAccept to add it to your watching list, or decline.`;
}

function watchListFull(name) {
    const who = plainName(name, 64, 'That person');
    return `${who}'s watching list is full.`;
}

function fullListNotice(senderName, mediaOrTitle) {
    const who = plainName(senderName, 64, 'Someone');
    const title = mediaTitle(mediaOrTitle);
    return {
        content: `📭 **${who}** tried to recommend you **${title}**, but your watching list is full (${MAX_WATCHING}/${MAX_WATCHING}). Make room with /watching remove or mark something completed!`,
        allowedMentions: allowedMentions(),
    };
}

function acceptConfirmation(title, options = {}) {
    const line = `🎉 You accepted **${plainName(title, 200, 'that anime')}**!`;
    if (options.full) return `${line}\nYour watching list is full. Remove something with /watching remove, or mark one completed.`;
    return line;
}

function declineConfirmation(title) {
    return `You passed on **${plainName(title, 200, 'that anime')}**. Maybe next time.`;
}

function acceptanceNotice(userName, title) {
    const who = plainName(userName, 64, 'They');
    const show = plainName(title, 200, 'that anime');
    return `🎉 **${who}** accepted your recommendation for **${show}**!`;
}

function utcDay(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

function isRecommendButton(customId) {
    return typeof customId === 'string' && BUTTON_RE.test(customId);
}

function snapshot(media) {
    const titles = media && media.titles ? media.titles : {};
    return {
        id: media && media.id != null ? String(media.id) : '',
        source: media && media.source === 'Kitsu' ? 'Kitsu' : 'AniList',
        url: media && typeof media.url === 'string' ? media.url : '',
        cover: media && typeof media.cover === 'string' ? media.cover : '',
        titles: {
            romaji: typeof titles.romaji === 'string' ? titles.romaji : '',
            english: typeof titles.english === 'string' ? titles.english : '',
            native: typeof titles.native === 'string' ? titles.native : '',
        },
        synonyms: Array.isArray(media && media.synonyms) ? media.synonyms.slice(0, 12) : [],
        synopsis: String(media && media.synopsis || '').slice(0, 1200),
        episodes: media ? media.episodes : null,
        status: media && typeof media.status === 'string' ? media.status : '',
        score: media ? media.score : null,
        genres: Array.isArray(media && media.genres) ? media.genres.slice(0, 12) : [],
        tags: Array.isArray(media && media.tags) ? media.tags.slice(0, 5) : [],
        studios: Array.isArray(media && media.studios) ? media.studios.slice(0, 4) : [],
        startDate: media ? media.startDate : null,
        endDate: media ? media.endDate : null,
    };
}

async function checkRecommend({
    senderId,
    targetId,
    anilist: anime,
    inGuild,
    targetIsBot,
    now = Date.now(),
}) {
    const sender = snowflake(senderId);
    const target = snowflake(targetId);
    const animeKey = anilistId(anime);
    if (!sender || !target || !animeKey) return { ok: false, message: NOT_IN_SERVER };
    if (sender === target) return { ok: false, message: SELF };
    if (targetIsBot) return { ok: false, message: BOT };
    if (!inGuild) return { ok: false, message: NOT_IN_SERVER };

    const profile = await AnimeProfile.findOne({ userId: target });
    if (!profile) return { ok: false, message: NO_PROFILE };
    if (profile.recommendations !== true) return { ok: false, message: RECS_OFF };

    const pending = await PendingRecommendation.findOne({
        targetId: target,
        anilistId: animeKey,
        status: 'pending',
    });
    if (pending) return { ok: false, message: DUPLICATE };

    const senderGuard = await RecommendGuard.findOne({ userId: sender });
    if (senderGuard && senderGuard.lastSentAt) {
        const elapsed = now - new Date(senderGuard.lastSentAt).getTime();
        if (elapsed < COOLDOWN_MS) return { ok: false, message: COOLDOWN };
    }

    const day = utcDay(now);
    const targetGuard = await RecommendGuard.findOne({ userId: target });
    const count = targetGuard && targetGuard.receivedDay === day ? targetGuard.receivedCount : 0;
    // A full list blocks a new recommendation. Accepting one that was already
    // delivered can still mark a show that is already on the list.
    if (readWatching(profile).length >= MAX_WATCHING) {
        return {
            ok: false,
            full: true,
            skipNotice: count >= DAILY_CAP,
            sender,
            target,
            animeKey,
            message: watchListFull(),
        };
    }
    if (count >= DAILY_CAP) return { ok: false, message: DAILY };

    return { ok: true, sender, target, animeKey };
}

function duplicateKey(error) { return error?.code === 11000 || error?.code === 11001; }
async function ensureGuard(userId) {
    try { await RecommendGuard.updateOne({ userId }, { $setOnInsert: { receivedCount: 0 } }, { upsert: true }); }
    catch (error) { if (!duplicateKey(error)) throw error; }
}
async function reserveQuota(sender, target, publicId, now) {
    await Promise.all([ensureGuard(sender), ensureGuard(target)]);
    const sent = await RecommendGuard.findOneAndUpdate({ userId: sender, $or: [
        { lastSentAt: { $lte: new Date(now - COOLDOWN_MS) } }, { lastSentAt: { $exists: false } }, { lastSentAt: null },
    ] }, { $set: { lastSentAt: new Date(now), reservationId: publicId } }, { returnDocument: 'after' });
    if (!sent) return { ok: false, message: COOLDOWN };
    const day = utcDay(now);
    try {
        const received = await RecommendGuard.findOneAndUpdate({ userId: target, $or: [
            { receivedDay: { $ne: day } }, { receivedCount: { $lt: DAILY_CAP } },
        ] }, [{ $set: { receivedDay: day, receivedCount: { $cond: [
            { $eq: ['$receivedDay', day] }, { $add: [{ $ifNull: ['$receivedCount', 0] }, 1] }, 1,
        ] } } }], { updatePipeline: true, returnDocument: 'after' });
        if (received) return { ok: true, sender, target, publicId, day };
        await RecommendGuard.updateOne({ userId: sender, reservationId: publicId }, { $unset: { lastSentAt: 1, reservationId: 1 } });
        return { ok: false, message: DAILY };
    } catch (error) {
        await RecommendGuard.updateOne({ userId: sender, reservationId: publicId }, { $unset: { lastSentAt: 1, reservationId: 1 } });
        throw error;
    }
}
async function releaseQuota(reservation) {
    const { sender, target, publicId, day } = reservation;
    await Promise.all([
        RecommendGuard.updateOne({ userId: sender, reservationId: publicId }, { $unset: { lastSentAt: 1, reservationId: 1 } }),
        RecommendGuard.updateOne({ userId: target, receivedDay: day, receivedCount: { $gt: 0 } }, { $inc: { receivedCount: -1 } }),
    ]);
}
async function claimFullNotice(senderId, targetId, now) {
    try {
        await FullListNotice.create({ senderId, targetId, day: utcDay(now), createdAt: new Date(now) });
        return true;
    } catch (error) { if (duplicateKey(error)) return false; throw error; }
}

async function commitRecommend({ sender, target, animeKey, guildId, title, media, publicId, now = Date.now() }) {
    const reservation = await reserveQuota(sender, target, publicId, now);
    if (!reservation.ok) return reservation;
    try {
        await PendingRecommendation.create({ publicId, senderId: sender, targetId: target,
            guildId: snowflake(guildId) || '0', anilistId: animeKey, title: neutralize(title, 200),
            media: snapshot(media), status: 'pending', activeKey: `${target}:${animeKey}`, deliveryState: 'reserved' });
    } catch (error) {
        await releaseQuota(reservation);
        if (duplicateKey(error)) return { ok: false, message: DUPLICATE };
        throw error;
    }
    return reservation;
}

function dmPayload(senderName, media, publicId, guildName) {
    const shot = snapshot(media);
    return {
        content: recommendationDm(senderName, media, guildName),
        embeds: [animeEmbed(shot, { cached: Boolean(media && media.cached) })],
        components: [recommendRow(publicId)],
        allowedMentions: allowedMentions(),
    };
}

async function deliverRecommend({
    senderId,
    targetId,
    senderName,
    targetName,
    anilist: anime,
    inGuild,
    targetIsBot,
    guildId,
    guildName,
    media,
    send,
    now = Date.now(),
}) {
    const decision = await checkRecommend({
        senderId,
        targetId,
        anilist: anime,
        inGuild,
        targetIsBot,
        now,
    });
    const publicId = crypto.randomBytes(8).toString('hex');
    if (decision.full) {
        if (decision.skipNotice || typeof send !== 'function') return { ok: false, message: watchListFull(targetName) };
        const quota = await reserveQuota(decision.sender, decision.target, publicId, now);
        if (!quota.ok) return quota;
        if (!await claimFullNotice(decision.sender, decision.target, now)) {
            await releaseQuota(quota);
            return { ok: false, message: watchListFull(targetName) };
        }
        try { await send(fullListNotice(senderName, media)); }
        catch (error) { console.debug(redact(error)); }
        return { ok: false, message: watchListFull(targetName) };
    }
    if (!decision.ok) return decision;
    const reservation = await commitRecommend({ sender: decision.sender, target: decision.target,
        animeKey: decision.animeKey, guildId, title: mediaTitle(media), media, publicId, now });
    if (!reservation.ok) return reservation;
    let message;
    try { message = await send(dmPayload(senderName, media, publicId, guildName)); }
    catch (error) {
        // A definite Discord rejection can be compensated. A network timeout may
        // have delivered: retain the reservation and never automatically resend.
        if (error?.code === 50007 || error?.status === 403) {
            await PendingRecommendation.deleteOne({ publicId, deliveryState: 'reserved' });
            await releaseQuota(reservation);
            return { ok: false, closedDm: true, message: DM_CLOSED };
        }
        await PendingRecommendation.updateOne({ publicId }, { $set: { deliveryState: 'uncertain' } });
        return { ok: false, message: 'Delivery could not be confirmed. Please check with the recipient before trying again.' };
    }
    try {
        await PendingRecommendation.updateOne({ publicId }, { $set: { deliveryState: 'sent', deliveryId: message?.id || '' } });
    } catch (error) {
        console.error(redact(error));
        return { ok: false, message: 'The DM was sent, but its delivery receipt could not be saved. Its buttons still work.', publicId };
    }
    return { ok: true, message: SENT, publicId };
}

async function handleRecommendButton(interaction, client) {
    const match = typeof interaction.customId === 'string' ? BUTTON_RE.exec(interaction.customId) : null;
    if (!match) return;
    const action = match[1] === 'a' ? 'accepted' : 'declined';
    const publicId = match[2];
    const userId = snowflake(interaction.user && interaction.user.id);
    if (!userId) {
        await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }

    await deferComponent(interaction);
    const answer = (payload) => interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
    const existing = await PendingRecommendation.findOne({ publicId });
    if (!existing) {
        await answer({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    if (existing.targetId !== userId) {
        await answer({ content: NOT_YOURS, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    if (existing.status !== 'pending') {
        await answer({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }

    const doc = await PendingRecommendation.findOneAndUpdate(
        { publicId, targetId: userId, status: 'pending', $or: [{ processingUntil: { $exists: false } }, { processingUntil: { $lte: new Date() } }] },
        { $set: { processingUntil: new Date(Date.now() + 30000) } },
        { returnDocument: 'after' },
    );
    if (!doc) {
        await answer({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }

    const title = neutralize(doc.title, 200) || 'that anime';
    let watchingFull = false;
    try {
    if (action === 'accepted') {
        const profile = await AnimeProfile.findOne({ userId });
        if (profile) {
            await noteIdentity(profile, interaction.user, interaction.member);
            const result = addWatching(profile, {
                id: doc.anilistId,
                titles: { english: title },
            }, { recommended: true, fromUserId: doc.senderId });
            if (result.reason === 'full') {
                watchingFull = true;
            } else if (result.ok) {
                applyWatching(profile, result.list);
                await profile.save();
            }
        }
    }

    if (watchingFull) {
        await PendingRecommendation.updateOne({ publicId }, { $unset: { processingUntil: 1 } });
        await answer({ content: 'Your watching list is full. Make room with /watching remove, then accept again.', flags: MessageFlags.Ephemeral });
        return;
    }
    await PendingRecommendation.updateOne({ publicId, status: 'pending' },
        { $set: { status: action }, $unset: { activeKey: 1, processingUntil: 1 } });
    } catch (error) {
        await PendingRecommendation.updateOne({ publicId, status: 'pending' }, { $unset: { processingUntil: 1 } });
        throw error;
    }

    const content = action === 'accepted'
        ? acceptConfirmation(title, { full: watchingFull })
        : declineConfirmation(title);
    await updateComponent(interaction, {
        content,
        embeds: interaction.message && interaction.message.embeds ? interaction.message.embeds : [],
        components: [],
        allowedMentions: allowedMentions(),
    });

    if (action !== 'accepted') return;
    try {
        const senderId = snowflake(doc.senderId);
        if (!senderId || !client || !client.users || typeof client.users.fetch !== 'function') return;
        const sender = await client.users.fetch(senderId);
        await sender.send({
            content: acceptanceNotice(interaction.user.globalName || interaction.user.username, title),
            allowedMentions: allowedMentions(),
        });
    } catch (error) {
        // A closed DM on the way back does not undo the accept.
    }
}

module.exports = {
    COOLDOWN_MS,
    DAILY_CAP,
    SELF,
    BOT,
    NOT_IN_SERVER,
    NO_PROFILE,
    RECS_OFF,
    DUPLICATE,
    COOLDOWN,
    DAILY,
    DM_CLOSED,
    SENT,
    NOT_YOURS,
    INACTIVE,
    isRecommendButton,
    checkRecommend,
    commitRecommend,
    deliverRecommend,
    handleRecommendButton,
    dmPayload,
    snapshot,
    recommendationDm,
    watchListFull,
    fullListNotice,
    acceptConfirmation,
    declineConfirmation,
    acceptanceNotice,
};
