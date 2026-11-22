const crypto = require('crypto');
const { MessageFlags } = require('discord.js');
const AnimeProfile = require('../Models/AnimeProfile');
const { PendingRecommendation, RecommendGuard } = require('../Models/AnimeRecommend');
const { formatMessage } = require('../utils/formatMessage');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');
const { recommendRow } = require('./components');
const { animeEmbed } = require('./embed');
const { anilistId, snowflake } = require('./ids');
const { neutralize } = require('./text');

const COOLDOWN_MS = 5 * 60 * 1000;
const DAILY_CAP = 5;
const ACCEPTED_CAP = 25;
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
    if (count >= DAILY_CAP) return { ok: false, message: DAILY };

    return { ok: true, sender, target, animeKey };
}

async function commitRecommend({ sender, target, animeKey, guildId, title, media, publicId, now = Date.now() }) {
    const guild = snowflake(guildId);
    await PendingRecommendation.create({
        publicId,
        senderId: sender,
        targetId: target,
        guildId: guild || '0',
        anilistId: animeKey,
        title: neutralize(title, 200),
        media: snapshot(media),
        status: 'pending',
    });

    await RecommendGuard.findOneAndUpdate(
        { userId: sender },
        { $set: { lastSentAt: new Date(now) } },
        { upsert: true },
    );

    const day = utcDay(now);
    const guard = await RecommendGuard.findOne({ userId: target });
    if (!guard) {
        await RecommendGuard.create({ userId: target, receivedDay: day, receivedCount: 1 });
        return;
    }
    if (guard.receivedDay !== day) {
        guard.receivedDay = day;
        guard.receivedCount = 1;
    } else {
        guard.receivedCount += 1;
    }
    await guard.save();
}

function dmPayload(senderName, media, publicId) {
    const title = neutralize(media && (media.titles && (media.titles.english || media.titles.romaji) || media.title), 200) || 'an anime';
    return {
        content: formatMessage('{user} recommended {title}', {
            user: neutralize(senderName, 64) || 'Someone',
            title,
        }),
        embeds: [animeEmbed(snapshot(media))],
        components: [recommendRow(publicId)],
        allowedMentions: allowedMentions(),
    };
}

async function deliverRecommend({
    senderId,
    targetId,
    senderName,
    anilist: anime,
    inGuild,
    targetIsBot,
    guildId,
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
    if (!decision.ok) return decision;
    const publicId = crypto.randomBytes(8).toString('hex');
    try {
        await send(dmPayload(senderName, media, publicId));
    } catch (error) {
        return { ok: false, closedDm: true, message: DM_CLOSED };
    }
    try {
        await commitRecommend({
            sender: decision.sender,
            target: decision.target,
            animeKey: decision.animeKey,
            guildId,
            title: media && (media.titles && (media.titles.english || media.titles.romaji)),
            media,
            publicId,
            now,
        });
    } catch (error) {
        console.error(redact(error));
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

    const existing = await PendingRecommendation.findOne({ publicId });
    if (!existing) {
        await interaction.reply({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    if (existing.targetId !== userId) {
        await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    if (existing.status !== 'pending') {
        await interaction.reply({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }

    const doc = await PendingRecommendation.findOneAndUpdate(
        { publicId, targetId: userId, status: 'pending' },
        { $set: { status: action } },
        { returnDocument: 'after' },
    );
    if (!doc) {
        await interaction.reply({ content: INACTIVE, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }

    const title = neutralize(doc.title, 200) || 'that anime';
    if (action === 'accepted') {
        const profile = await AnimeProfile.findOne({ userId });
        if (profile) {
            const list = Array.isArray(profile.accepted) ? profile.accepted.slice() : [];
            if (!list.some((item) => item && item.anilistId === doc.anilistId)) {
                list.push({
                    anilistId: doc.anilistId,
                    title,
                    fromUserId: doc.senderId,
                    at: new Date(),
                });
            }
            profile.accepted = list.slice(-ACCEPTED_CAP);
            profile.markModified('accepted');
            await profile.save();
        }
    }

    const content = action === 'accepted'
        ? formatMessage('You accepted {title}.', { title })
        : formatMessage('You declined {title}.', { title });
    await interaction.update({
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
        const targetName = neutralize(interaction.user.username, 64) || 'They';
        await sender.send({
            content: formatMessage('{user} accepted {title}.', { user: targetName, title }),
            allowedMentions: allowedMentions(),
        });
    } catch (error) {
        // A closed DM on the way back does not undo the accept.
    }
}

module.exports = {
    COOLDOWN_MS,
    DAILY_CAP,
    ACCEPTED_CAP,
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
};
