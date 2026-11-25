const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    PermissionFlagsBits,
} = require('discord.js');
const AnimeFollow = require('../Models/AnimeFollow');
const AnimeProfile = require('../Models/AnimeProfile');
const { getGuildConfig } = require('../utils/getGuildConfig');
const { allowedMentions } = require('../utils/mentions');
const { redact } = require('../utils/redact');
const { embed: styledEmbed } = require('../utils/style');
const { listValues, statusText } = require('../commands/configuration/handlers/configFields');
const { scoreText } = require('./details');
const { anilistId, snowflake } = require('./ids');
const { statusInfo } = require('./library');
const { neutralize } = require('./text');

// Watch Feed: list updates from people who opted in, posted to the server's
// feed channel and sent by DM to their followers.
//
// Timing: a status change, score, or import posts after QUICK_DELAY_MS, which
// only exists so "set + score" in quick succession becomes one post. Episode
// ticks wait for PROGRESS_QUIET_MS without another tick on that show, so
// clicking +1 five times posts once. Nothing waits longer than MAX_WAIT_MS
// from its first update, however many ticks follow.
const QUICK_DELAY_MS = 4 * 1000;
const PROGRESS_QUIET_MS = 15 * 1000;
const MAX_WAIT_MS = 45 * 1000;
const FEED_DELAY_MS = PROGRESS_QUIET_MS;
const MAX_FOLLOWING = 200;
const MAX_FOLLOWERS_NOTIFIED = 500;
const DM_FAILURE_CAP = 3;
// Follower DMs: DM_WORKERS senders, each pausing DM_SPACING_MS between DMs, so
// about 20 DMs a second at most. discord.js still queues on any 429.
const DM_SPACING_MS = 150;
const DM_WORKERS = 3;
const DM_QUEUE_MAX = 5000;
const PENDING_MAX = 2000;
const UNFOLLOW_PREFIX = 'feed:u:';
const UNFOLLOW_RE = /^feed:u:(\d{17,20})$/;
const FEED_PERMISSIONS = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
];

function personName(profile, user) {
    return neutralize(user && (user.globalName || user.username), 64)
        || neutralize(profile && profile.nameLabel, 64)
        || 'Someone';
}

function bold(title) {
    return `**${neutralize(title, 120) || 'an anime'}**`;
}

function episodeRange(event) {
    const to = Number(event.progress) || 0;
    const from = Number(event.fromProgress);
    const total = Number(event.episodes) || 0;
    const of = total ? ` of ${total}` : '';
    if (Number.isFinite(from) && from + 1 < to) return `episodes ${from + 1}–${to}${of}`;
    return `episode ${to}${of}`;
}

// One line describing the update, without the person's name.
function activityText(event) {
    const title = bold(event.title);
    const score = scoreText(event.score);
    const rated = score ? ` and rated it ★${score}` : '';
    if (event.type === 'progress') return `watched ${episodeRange(event)} of ${title}`;
    if (event.type === 'score') return `rated ${title} ★${score || '?'}`;
    if (event.type === 'import') return `synced their list from AniList (${Number(event.count) || 0} shows)`;
    switch (event.status) {
        case 'watching': return event.from === 'paused' ? `picked ${title} back up` : `started watching ${title}`;
        case 'planning': return `plans to watch ${title}`;
        case 'completed': return event.from === 'rewatching' ? `finished rewatching ${title}${rated}` : `completed ${title}${rated}`;
        case 'rewatching': return `started rewatching ${title}`;
        case 'paused': return `paused ${title}${event.progress ? ` at ${episodeRange(event)}` : ''}`;
        case 'dropped': return `dropped ${title}${event.progress ? ` at ${episodeRange(event)}` : ''}`;
        default: return `updated ${title}`;
    }
}

function feedEmbed(event, name, user) {
    const info = event.status ? statusInfo(event.status) : null;
    const emoji = event.type === 'progress' ? '▶️' : (event.type === 'score' ? '⭐' : (event.type === 'import' ? '📥' : (info ? info.emoji : '📣')));
    const id = anilistId(event.anilistId);
    const built = styledEmbed({
        description: `${emoji} **${name}** ${activityText(event)}`.slice(0, 4096),
        label: 'feed',
        url: id ? `https://anilist.co/anime/${id}` : undefined,
    });
    if (id) built.setTitle((neutralize(event.title, 200) || 'Anime').slice(0, 256));
    if (user && typeof user.displayAvatarURL === 'function') built.setThumbnail(user.displayAvatarURL());
    return built;
}

function unfollowRow(targetId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${UNFOLLOW_PREFIX}${targetId}`)
            .setLabel('Unfollow')
            .setStyle(ButtonStyle.Secondary),
    );
}

function errorCode(error) {
    const code = error && (error.code ?? (error.rawError && error.rawError.code));
    return Number(code) || 0;
}

function createFeed({
    delayMs,
    quickMs = delayMs ?? QUICK_DELAY_MS,
    progressMs = delayMs ?? PROGRESS_QUIET_MS,
    maxWaitMs = MAX_WAIT_MS,
    spacingMs = DM_SPACING_MS,
    workers = DM_WORKERS,
    now = Date.now,
    Follow = AnimeFollow,
    Profile = AnimeProfile,
    readConfig = (guildId) => getGuildConfig(guildId, { readOnly: true }),
    timers = { setTimeout, clearTimeout },
} = {}) {
    const pending = new Map();
    const dmQueue = [];
    let active = 0;

    async function postToGuild(client, guildId, embedPayload) {
        const id = snowflake(guildId);
        if (!id || !client) return false;
        const config = await readConfig(id);
        if (!config || statusText(config.FeedStatus) !== 'true') return false;
        const channelId = snowflake(listValues(config.FeedChannel, 'Channel')[0]);
        if (!channelId) return false;
        let channel = client.channels && client.channels.cache ? client.channels.cache.get(channelId) : null;
        if (!channel && client.channels && typeof client.channels.fetch === 'function') {
            try { channel = await client.channels.fetch(channelId); } catch (error) { channel = null; }
        }
        if (!channel || typeof channel.send !== 'function' || String(channel.guildId || (channel.guild && channel.guild.id)) !== id) return false;
        const me = channel.guild && channel.guild.members ? channel.guild.members.me : null;
        if (me && typeof channel.permissionsFor === 'function') {
            const perms = channel.permissionsFor(me);
            if (!perms || !perms.has(FEED_PERMISSIONS)) return false;
        }
        await channel.send({ embeds: [embedPayload], allowedMentions: allowedMentions() });
        return true;
    }

    async function sendOne(client, job) {
        try {
            const user = await client.users.fetch(job.followerId);
            await user.send({
                content: `📣 Update from someone you follow. Unfollow below to stop these.`,
                embeds: [job.embed],
                components: [unfollowRow(job.targetId)],
                allowedMentions: allowedMentions(),
            });
            if (job.failures) await Follow.updateOne({ followerId: job.followerId, targetId: job.targetId }, { $set: { failures: 0 } });
        } catch (error) {
            const code = errorCode(error);
            // 50007: DMs closed. 10013: unknown user. Anything else is transient.
            if (code !== 50007 && code !== 10013) {
                console.error('Watch Feed DM failed.', redact(error));
                return;
            }
            const row = await Follow.findOneAndUpdate(
                { followerId: job.followerId, targetId: job.targetId },
                { $inc: { failures: 1 } },
                { returnDocument: 'after' },
            );
            if (row && row.failures >= DM_FAILURE_CAP) await Follow.deleteOne({ _id: row._id });
        }
    }

    function pause(ms) {
        return new Promise((resolve) => {
            const timer = timers.setTimeout(resolve, ms);
            if (timer && typeof timer.unref === 'function') timer.unref();
        });
    }

    async function worker(client) {
        try {
            for (;;) {
                const job = dmQueue.shift();
                if (!job) return;
                try { await sendOne(client, job); } catch (error) { console.error('Watch Feed DM failed.', redact(error)); }
                if (dmQueue.length) await pause(spacingMs);
            }
        } finally {
            active -= 1;
        }
    }

    function drain(client) {
        while (active < workers && dmQueue.length) {
            active += 1;
            void worker(client);
        }
    }

    // Resolves once every queued DM has been tried. For tests and shutdown.
    async function settle(runTimers) {
        for (let guard = 0; guard < 10000 && (active || dmQueue.length); guard += 1) {
            if (typeof runTimers === 'function') await runTimers();
            await new Promise((resolve) => setImmediate(resolve));
        }
    }

    async function notifyFollowers(client, targetId, embedPayload) {
        const rows = await Follow.find({ targetId }).select('followerId failures').limit(MAX_FOLLOWERS_NOTIFIED).lean();
        let queued = 0;
        for (const row of rows) {
            const followerId = snowflake(row.followerId);
            if (!followerId || followerId === targetId) continue;
            if (dmQueue.length >= DM_QUEUE_MAX) break;
            dmQueue.push({ followerId, targetId, embed: embedPayload, failures: row.failures || 0 });
            queued += 1;
        }
        if (queued) drain(client);
        return queued;
    }

    // Reads the owner's settings again at send time, so turning sharing off
    // during the merge window still stops the post.
    async function deliver(event) {
        const userId = snowflake(event.userId);
        if (!userId) return { guild: false, followers: 0 };
        const profile = await Profile.findOne({ userId }).select('userId nameLabel activityFeed allowFollows').lean();
        if (!profile || (!profile.activityFeed && !profile.allowFollows)) return { guild: false, followers: 0 };
        const name = personName(profile, event.user);
        const payload = feedEmbed(event, name, event.user);
        let guild = false;
        let followers = 0;
        if (profile.activityFeed) {
            try { guild = await postToGuild(event.client, event.guildId, payload); } catch (error) { console.error('Watch Feed post failed.', redact(error)); }
        }
        if (profile.allowFollows) followers = await notifyFollowers(event.client, userId, payload);
        return { guild, followers };
    }

    function merge(previous, next) {
        if (!previous) return { ...next };
        const merged = { ...previous, ...next };
        if (previous.type === 'progress' && next.type === 'progress') merged.fromProgress = previous.fromProgress;
        // A progress tick after a status change keeps the status line.
        if (previous.type === 'status' && next.type === 'progress') {
            merged.type = 'status';
            merged.status = previous.status;
            merged.from = previous.from;
        }
        if (next.type === 'score' && previous.type !== 'score') {
            merged.type = previous.type;
            merged.status = previous.status;
            merged.from = previous.from;
        }
        if (merged.score == null && previous.score != null) merged.score = previous.score;
        return merged;
    }

    // Queues one update. Returns false when it was dropped (no owner, or the
    // pending table is full).
    function record(event) {
        const userId = snowflake(event && event.userId);
        if (!userId || !event.client) return false;
        const key = `${userId}:${anilistId(event.anilistId) || event.type}`;
        const previous = pending.get(key);
        if (!previous && pending.size >= PENDING_MAX) return false;
        if (previous) timers.clearTimeout(previous.timer);
        const merged = merge(previous && previous.event, event);
        const at = now();
        const firstAt = previous ? previous.firstAt : at;
        const wait = event.type === 'progress' ? progressMs : quickMs;
        const due = Math.max(0, Math.min(wait, firstAt + maxWaitMs - at));
        const timer = timers.setTimeout(() => {
            pending.delete(key);
            return deliver(merged).catch((error) => console.error('Watch Feed delivery failed.', redact(error)));
        }, due);
        if (timer && typeof timer.unref === 'function') timer.unref();
        pending.set(key, { event: merged, timer, firstAt });
        return true;
    }

    async function flush() {
        const jobs = [...pending.values()];
        pending.clear();
        const results = [];
        for (const job of jobs) {
            timers.clearTimeout(job.timer);
            results.push(await deliver(job.event));
        }
        return results;
    }

    return {
        record,
        deliver,
        flush,
        postToGuild,
        notifyFollowers,
        settle,
        pendingCount: () => pending.size,
        queuedDms: () => dmQueue.length,
    };
}

const shared = createFeed();

// Shortcut for commands: builds the event from the interaction.
function recordActivity(interaction, event) {
    if (!interaction || !event) return false;
    try {
        return shared.record({
            ...event,
            userId: interaction.user && interaction.user.id,
            user: interaction.user,
            guildId: interaction.guildId || (interaction.guild && interaction.guild.id),
            client: interaction.client,
        });
    } catch (error) {
        console.error('Watch Feed record failed.', redact(error));
        return false;
    }
}

// Activity for a status change result from library.setStatus or editEntry.
function statusEvent(result, extra = {}) {
    if (!result || !result.ok || !result.entry) return null;
    return {
        type: 'status',
        status: result.status,
        from: result.from || null,
        anilistId: result.entry.anilistId,
        title: result.entry.title,
        progress: result.entry.progress,
        episodes: result.entry.episodes,
        score: result.entry.score,
        ...extra,
    };
}

// --- Following -----------------------------------------------------------

const FOLLOW_MESSAGES = Object.freeze({
    self: "You can't follow yourself.",
    missing: "That person hasn't set up an anime profile.",
    closed: "That person hasn't turned on followers.",
    already: 'You already follow them.',
    full: `You can follow up to ${MAX_FOLLOWING} people. Unfollow someone first.`,
});

async function follow(followerId, targetId, { Follow = AnimeFollow, Profile = AnimeProfile } = {}) {
    const follower = snowflake(followerId);
    const target = snowflake(targetId);
    if (!follower || !target) return { ok: false, reason: 'missing' };
    if (follower === target) return { ok: false, reason: 'self' };
    const profile = await Profile.findOne({ userId: target }).select('userId allowFollows nameLabel').lean();
    if (!profile) return { ok: false, reason: 'missing' };
    if (!profile.allowFollows) return { ok: false, reason: 'closed' };
    const count = await Follow.countDocuments({ followerId: follower });
    if (count >= MAX_FOLLOWING) return { ok: false, reason: 'full' };
    try {
        await Follow.create({ followerId: follower, targetId: target });
    } catch (error) {
        if (error && (error.code === 11000 || error.code === 11001)) return { ok: false, reason: 'already' };
        throw error;
    }
    return { ok: true, name: neutralize(profile.nameLabel, 64) };
}

async function unfollow(followerId, targetId, { Follow = AnimeFollow } = {}) {
    const follower = snowflake(followerId);
    const target = snowflake(targetId);
    if (!follower || !target) return { ok: false };
    const result = await Follow.deleteOne({ followerId: follower, targetId: target });
    return { ok: Boolean(result && result.deletedCount) };
}

async function following(followerId, { Follow = AnimeFollow, Profile = AnimeProfile } = {}) {
    const follower = snowflake(followerId);
    if (!follower) return [];
    const rows = await Follow.find({ followerId: follower }).sort({ createdAt: -1 }).limit(MAX_FOLLOWING).lean();
    const ids = rows.map((row) => snowflake(row.targetId)).filter(Boolean);
    if (!ids.length) return [];
    const profiles = await Profile.find({ userId: { $in: ids } }).select('userId nameLabel allowFollows').lean();
    const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
    return ids.map((id) => {
        const profile = byId.get(id);
        return {
            id,
            name: neutralize(profile && profile.nameLabel, 64) || 'Anime profile',
            active: Boolean(profile && profile.allowFollows),
        };
    });
}

async function followerCount(targetId, { Follow = AnimeFollow } = {}) {
    const target = snowflake(targetId);
    if (!target) return 0;
    return Follow.countDocuments({ targetId: target });
}

// Turning followers off removes every follow of that profile, so turning it
// back on later starts from zero instead of quietly resuming old followers.
async function dropFollowers(targetId, { Follow = AnimeFollow } = {}) {
    const target = snowflake(targetId);
    if (!target) return 0;
    const result = await Follow.deleteMany({ targetId: target });
    return result ? result.deletedCount || 0 : 0;
}

async function dropAllFollows(userId, { Follow = AnimeFollow } = {}) {
    const id = snowflake(userId);
    if (!id) return;
    await Follow.deleteMany({ $or: [{ followerId: id }, { targetId: id }] });
}

function isUnfollowButton(customId) {
    return typeof customId === 'string' && UNFOLLOW_RE.test(customId);
}

// The Unfollow button on a DM. It only ever removes the clicker's own follow.
async function handleUnfollowButton(interaction, deps = {}) {
    const match = UNFOLLOW_RE.exec(interaction.customId || '');
    const followerId = snowflake(interaction.user && interaction.user.id);
    if (!match || !followerId) return;
    const result = await (deps.unfollow || unfollow)(followerId, match[1]);
    const content = result.ok ? '🔕 Unfollowed. You will not get their updates anymore.' : 'You already unfollowed them.';
    if (typeof interaction.update === 'function' && !interaction.deferred && !interaction.replied) {
        await interaction.update({ components: [], allowedMentions: allowedMentions() });
        await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    await interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
}

module.exports = {
    FEED_DELAY_MS,
    QUICK_DELAY_MS,
    PROGRESS_QUIET_MS,
    MAX_WAIT_MS,
    DM_WORKERS,
    MAX_FOLLOWING,
    MAX_FOLLOWERS_NOTIFIED,
    DM_FAILURE_CAP,
    FOLLOW_MESSAGES,
    UNFOLLOW_PREFIX,
    activityText,
    feedEmbed,
    createFeed,
    recordActivity,
    statusEvent,
    follow,
    unfollow,
    following,
    followerCount,
    dropFollowers,
    dropAllFollows,
    isUnfollowButton,
    handleUnfollowButton,
    flushFeed: () => shared.flush(),
};
