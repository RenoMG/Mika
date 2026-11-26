const { randomUUID } = require('node:crypto');
const { Colors, EmbedBuilder, MessageFlags } = require('discord.js');
const infractionsDB = require('../Models/InfractionsDB');
const { getGuildConfig } = require('./getGuildConfig');
const { hierarchyBlock, HIERARCHY, positionOf } = require('./hierarchy');
const { defer, finish, replyWithMessage } = require('./ack');
const { isQuietError } = require('./interactionErrors');
const { allowedMentions } = require('./mentions');
const { redact } = require('./redact');
const { snowflake } = require('./safeId');
const { embed: styledEmbed, footer } = require('./style');
const { logChannel } = require('./logging');

const REASON_MAX = 512;
const { GENERIC_ERROR } = require('./messages');
const WARN_ID_MAX = 1000;

// The four kinds of record kept in InfractionsDB, keyed by the value the
// commands use for their `type` option.
const RECORD_TYPES = {
    warn: { key: 'Warns', one: 'warning', many: 'warnings', emoji: '⚠️' },
    mute: { key: 'Mutes', one: 'mute', many: 'mutes', emoji: '🔇' },
    kick: { key: 'Kicks', one: 'kick', many: 'kicks', emoji: '👢' },
    ban: { key: 'Bans', one: 'ban', many: 'bans', emoji: '🔨' },
};
const TYPE_CHOICES = Object.entries(RECORD_TYPES)
    .map(([value, type]) => ({ name: type.one[0].toUpperCase() + type.one.slice(1), value }));

const RECORD_FAILED = "⚠️ That worked, but I couldn't save it to the infraction record or the log.";
const LOG_FAILED = "⚠️ That worked, but I couldn't post it to the mod log.";

// "✅ @member was banned." plus an optional reason line. Mentions inside an
// embed show the display name and never ping.
function actionText(emoji, text, reason) {
    const lines = [`${emoji} ${text}`];
    if (reason) lines.push(`**Reason:** ${reason}`);
    return lines.join('\n');
}

function ephemeral(content) {
    return { content, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() };
}

function reasonFrom(value) {
    if (typeof value !== 'string') return { error: 'Give a reason.' };
    const reason = value.trim();
    if (!reason) return { error: 'Give a reason.' };
    if (reason.length > REASON_MAX) return { error: 'The reason cannot exceed 512 characters.' };
    return { reason };
}

function positiveInteger(value, max = WARN_ID_MAX) {
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(number) || number < 1 || number > max) return null;
    return number;
}

function embedReply(color, description, label, mentionIds) {
    return {
        embeds: [styledEmbed({ color, description: String(description), label })],
        allowedMentions: allowedMentions(...(mentionIds || [])),
    };
}

// The member option plus the reason, checked before anything is deferred.
function targetAndReason(interaction, botPermission, { reason = true } = {}) {
    const target = interaction.options.getMember('target');
    const block = guardMember(interaction, target, botPermission);
    if (block) return { error: block };
    if (!reason) return { target };
    const parsed = reasonFrom(interaction.options.getString('reason'));
    if (parsed.error) return { error: parsed.error };
    return { target, reason: parsed.reason };
}

// Runs the record keeping after a Discord action that already happened. A
// failure here must not report the action itself as failed.
async function followThrough(label, work) {
    try {
        return { value: await work() };
    } catch (error) {
        console.error(label, redact(error));
        return { failed: true };
    }
}

function botMemberOf(interaction) {
    return interaction.guild && interaction.guild.members ? interaction.guild.members.me : null;
}

function guardMember(interaction, target, botPermission) {
    const block = hierarchyBlock({
        guild: interaction.guild,
        invoker: interaction.member,
        target,
        botMember: botMemberOf(interaction),
    });
    if (block) return block;
    if (botPermission) {
        const me = botMemberOf(interaction);
        if (!me || !me.permissions || !me.permissions.has(botPermission)) return HIERARCHY.botPermission;
    }
    return null;
}

// Records are rows in Mika's database, not Discord actions, so the bot's role
// and permissions don't matter and people who already left (or were banned)
// can still be edited. Only the moderator's own standing is checked.
function recordGuard(interaction, user, member) {
    const id = snowflake(user && user.id);
    if (!id) return 'Choose a member or user.';
    if (id === String(interaction.user && interaction.user.id)) return HIERARCHY.self;
    const guild = interaction.guild;
    if (guild && guild.ownerId != null && id === String(guild.ownerId)) return HIERARCHY.owner;
    const me = botMemberOf(interaction);
    if (me && me.id != null && id === String(me.id)) return "I don't keep a record on myself.";
    const invokerId = String(interaction.user && interaction.user.id);
    const invokerIsOwner = Boolean(guild && guild.ownerId != null && invokerId === String(guild.ownerId));
    if (member && !invokerIsOwner && positionOf(member) >= positionOf(interaction.member)) return HIERARCHY.invokerRole;
    return null;
}

// The `target` option of a record command: a user, plus their member when
// they're still in the server.
function recordTarget(interaction) {
    const member = interaction.options.getMember('target') || null;
    const user = (member && member.user) || interaction.options.getUser('target') || member;
    const error = recordGuard(interaction, user, member);
    return error ? { error } : { user, member };
}

function recordTypeOf(value) {
    return Object.prototype.hasOwnProperty.call(RECORD_TYPES, value) ? RECORD_TYPES[value] : null;
}

function recordsOf(doc, key) {
    return doc && Array.isArray(doc[key]) ? doc[key] : [];
}

// Every record written since stable ids exist has a warningId (the name is
// historical; kicks, mutes and bans carry one too). Older rows match on content.
function sameEntry(a, b) {
    if (!a || !b) return false;
    if (a.warningId || b.warningId) return a.warningId === b.warningId;
    return JSON.stringify(a) === JSON.stringify(b);
}

// Removes one record from a loaded InfractionsDB document. With `expected`
// (the entry a menu showed), the entry is found again by id, so a list that
// changed in the meantime never loses the wrong row.
async function removeRecord(doc, key, { index, expected } = {}) {
    const list = recordsOf(doc, key).slice();
    const at = expected ? list.findIndex((entry) => sameEntry(entry, expected)) : index;
    if (!Number.isInteger(at) || at < 0 || at >= list.length) {
        return { error: expected ? 'That record has changed. Open the list again.' : 'That id is not on their list.' };
    }
    const [removed] = list.splice(at, 1);
    doc[key] = list;
    if (typeof doc.markModified === 'function') doc.markModified(key);
    await doc.save();
    return { removed, id: at + 1, doc };
}

// "2 warnings · 1 mute" for whatever the record holds, or "Clean".
function recordSummary(doc) {
    const parts = Object.values(RECORD_TYPES)
        .map((type) => [type, recordsOf(doc, type.key).length])
        .filter(([, count]) => count > 0)
        .map(([type, count]) => `${count} ${count === 1 ? type.one : type.many}`);
    return parts.length ? parts.join(' · ') : 'Clean';
}

function actorEntry(interaction, reason) {
    const id = snowflake(interaction.user && interaction.user.id);
    return {
        warningId: randomUUID(),
        ExecuterID: id,
        ExecuterTag: id ? `<@!${id}>` : 'unknown',
        Reason: reason,
        Date: new Date(interaction.createdTimestamp).toLocaleDateString(),
        // Epoch ms, so the date can render in each viewer's own timezone.
        At: interaction.createdTimestamp,
    };
}

async function findByMember(model, guildId, userId) {
    const guild = snowflake(guildId);
    const user = snowflake(userId);
    if (!guild || !user) return null;
    return model.findOne({ GuildID: guild, UserID: user });
}

async function pushInfraction(guildId, userId, key, entry) {
    const guild = snowflake(guildId);
    const user = snowflake(userId);
    if (!guild || !user) throw new TypeError('Invalid id');
    return appendEntry(infractionsDB, guild, user, key, entry);
}
async function appendEntry(model, guild, user, key, entry) {
    const filter = { GuildID: guild, UserID: user };
    const update = { $push: { [key]: entry }, $setOnInsert: { UserTag: `<@!${user}>` }, $inc: { __v: 1 } };
    try { return await model.findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: false }); }
    catch (error) {
        if (error.code !== 11000) throw error;
        return model.findOneAndUpdate(filter, update, { returnDocument: 'after' });
    }
}

// Every mod log reads the same: a title, the member, then short fields.
async function sendModLog(interaction, { color, title, targetId, fields = [], thumbnail, mentionIds }) {
    const guildId = snowflake(interaction.guild && interaction.guild.id);
    if (!guildId) return;
    const config = await getGuildConfig(guildId, { readOnly: true });
    const channel = await logChannel(interaction.guild, config);
    if (!channel) return;
    const target = snowflake(targetId);
    const moderator = snowflake(interaction.user && interaction.user.id);
    const embed = styledEmbed({ color, title, label: 'logs' })
        .addFields(
            { name: 'Member', value: target ? `<@${target}>\n\`${target}\`` : 'Unknown', inline: true },
            { name: 'Moderator', value: moderator ? `<@${moderator}>` : 'Unknown', inline: true },
            ...fields.filter((field) => field && field.value != null && String(field.value) !== '').map((field) => ({
                name: field.name,
                value: String(field.value).slice(0, 1024),
                inline: field.inline !== false,
            })),
        );
    if (thumbnail) embed.setThumbnail(thumbnail);
    await channel.send({
        embeds: [embed],
        allowedMentions: allowedMentions(...(mentionIds || [])),
    });
}

function avatarOf(holder) {
    return holder && typeof holder.displayAvatarURL === 'function' ? holder.displayAvatarURL() : null;
}

// Saves a warn, mute, kick or ban to the member's record and posts the mod log.
// For kick, ban and mute the Discord action already happened, so a failure here
// is reported as a note, never as the action failing. A warning is only the
// record, so `recordIsAction` lets a failed save fail the command.
async function recordAction(interaction, { type, user, reason, color, title, fields = [], recordIsAction = false }) {
    const { key } = RECORD_TYPES[type];
    // Through the export, so a test can stand in for the database.
    const save = () => module.exports.pushInfraction(interaction.guildId, user.id, key, actorEntry(interaction, reason));
    let doc = recordIsAction ? await save() : null;
    const result = await followThrough(`${title} record failed.`, async () => {
        if (!doc) doc = await save();
        await sendModLog(interaction, {
            color,
            title,
            thumbnail: avatarOf(user),
            targetId: user.id,
            fields: [
                ...fields,
                { name: 'Reason', value: reason, inline: false },
                { name: 'Record', value: recordSummary(doc) },
            ],
            mentionIds: [user.id, interaction.user.id],
        });
    });
    if (!result.failed) return { doc };
    return { doc, failed: true, note: doc ? LOG_FAILED : RECORD_FAILED };
}

// A mod log entry for something that isn't stored on the record: an unban,
// an unmute, or a change to the record itself.
async function logAction(interaction, { color, title, user, reason, fields = [] }) {
    const id = snowflake(user && user.id);
    const result = await followThrough(`${title} log failed.`, () => sendModLog(interaction, {
        color,
        title,
        thumbnail: avatarOf(user),
        targetId: id,
        fields: reason ? [...fields, { name: 'Reason', value: reason, inline: false }] : fields,
        mentionIds: [id, interaction.user.id].filter(Boolean),
    }));
    return result.failed ? { failed: true, note: LOG_FAILED } : {};
}

// The public reply every action ends with, plus the note when its record or
// log could not be saved.
function actionReply(interaction, { color, text, label, mentionIds, outcome }) {
    const body = outcome && outcome.note ? `${text}\n${outcome.note}` : text;
    return finish(interaction, embedReply(color, body, label, mentionIds));
}

async function replyError(interaction, error, label) {
    console.error(label, redact(error));
    if (interaction && interaction.replied) return null;
    try {
        await finish(interaction, ephemeral(GENERIC_ERROR));
    } catch (replyFailure) {
        if (!isQuietError(replyFailure)) console.error(redact(replyFailure));
    }
    return null;
}

module.exports = {
    Colors,
    EmbedBuilder,
    MessageFlags,
    REASON_MAX,
    GENERIC_ERROR,
    WARN_ID_MAX,
    RECORD_TYPES,
    TYPE_CHOICES,
    HIERARCHY,
    footer,
    actionText,
    ephemeral,
    reasonFrom,
    positiveInteger,
    embedReply,
    targetAndReason,
    followThrough,
    RECORD_FAILED,
    LOG_FAILED,
    guardMember,
    recordGuard,
    recordTarget,
    recordTypeOf,
    recordsOf,
    sameEntry,
    removeRecord,
    recordSummary,
    actorEntry,
    findByMember,
    pushInfraction,
    sendModLog,
    avatarOf,
    recordAction,
    logAction,
    actionReply,
    defer,
    finish,
    replyWithMessage,
    replyError,
    snowflake,
    allowedMentions,
    infractionsDB,
};
