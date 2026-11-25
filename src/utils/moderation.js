const { randomUUID } = require('node:crypto');
const { Colors, EmbedBuilder, MessageFlags } = require('discord.js');
const infractionsDB = require('../Models/InfractionsDB');
const warnDB = require('../Models/WarnDB');
const { getGuildConfig } = require('./getGuildConfig');
const { hierarchyBlock, HIERARCHY } = require('./hierarchy');
const { defer, finish, replyWithMessage } = require('./ack');
const { isQuietError } = require('./interactionErrors');
const { allowedMentions } = require('./mentions');
const { redact } = require('./redact');
const { snowflake } = require('./safeId');
const { footer: styleFooter } = require('./style');

const REASON_MAX = 512;
const { GENERIC_ERROR } = require('./messages');
const WARN_ID_MAX = 1000;

function footer(label, ...extra) {
    return styleFooter(label, ...extra);
}

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
        embeds: [new EmbedBuilder()
            .setColor(color)
            .setDescription(String(description).slice(0, 4096))
            .setTimestamp()
            .setFooter(footer(label))],
        allowedMentions: allowedMentions(...(mentionIds || [])),
    };
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
async function pushWarn(guildId, userId, entry) {
    const guild = snowflake(guildId);
    const user = snowflake(userId);
    if (!guild || !user) throw new TypeError('Invalid id');
    return appendEntry(warnDB, guild, user, 'Content', entry);
}

// Every mod log reads the same: a title, the member, then short fields.
async function sendModLog(interaction, { color, title, targetId, fields = [], thumbnail, mentionIds }) {
    const guildId = snowflake(interaction.guild && interaction.guild.id);
    if (!guildId) return;
    const config = await getGuildConfig(guildId);
    const status = (config.LoggingStatus || []).map((entry) => (entry ? entry.Status : undefined));
    if (`${status}` !== 'true') return;
    const channelId = (config.LoggingChannel || [])
        .map((entry) => (entry ? entry.Channel : ''))
        .find((id) => typeof id === 'string' && id);
    if (!channelId) return;
    const channel = interaction.guild.channels.cache.get(String(channelId));
    if (!channel || typeof channel.send !== 'function') return;
    const target = snowflake(targetId);
    const moderator = snowflake(interaction.user && interaction.user.id);
    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .addFields(
            { name: 'Member', value: target ? `<@${target}>\n\`${target}\`` : 'Unknown', inline: true },
            { name: 'Moderator', value: moderator ? `<@${moderator}>` : 'Unknown', inline: true },
            ...fields.filter((field) => field && field.value != null && String(field.value) !== '').map((field) => ({
                name: field.name,
                value: String(field.value).slice(0, 1024),
                inline: field.inline !== false,
            })),
        )
        .setTimestamp()
        .setFooter(footer('logs'));
    if (thumbnail) embed.setThumbnail(thumbnail);
    await channel.send({
        embeds: [embed],
        allowedMentions: allowedMentions(...(mentionIds || [])),
    });
}

function hold(interaction) {
    return defer(interaction);
}

function answer(interaction, payload) {
    return finish(interaction, payload);
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
    HIERARCHY,
    footer,
    actionText,
    ephemeral,
    reasonFrom,
    positiveInteger,
    embedReply,
    guardMember,
    actorEntry,
    findByMember,
    pushInfraction,
    pushWarn,
    sendModLog,
    hold,
    answer,
    replyWithMessage,
    replyError,
    snowflake,
    allowedMentions,
    infractionsDB,
    warnDB,
};
