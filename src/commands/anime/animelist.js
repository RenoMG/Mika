const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { allowedMentions } = require('../../utils/mentions');
const { embed: styledEmbed, timestamp } = require('../../utils/style');
const { animeAutocomplete, resolveAnime, respondWithin } = require('../../anime/autocomplete');
const { formatLabel, parseDateText, progressText, scoreText } = require('../../anime/details');
const { recordActivity, statusEvent } = require('../../anime/feed');
const { snowflake, anilistId } = require('../../anime/ids');
const {
    SORTS,
    editEntry,
    findEntry,
    libraryChoices,
    libraryLines,
    removeEntry,
    setStatus,
    statusChoices,
    statusInfo,
} = require('../../anime/library');
const { ephemeral } = require('../../anime/menu');
const { personName, presentUserList } = require('../../anime/pagedList');
const { SETUP_FIRST, getProfile, noteIdentity, profileForViewer } = require('../../anime/profiles');
const { statsEmbed } = require('../../anime/stats');
const { neutralize } = require('../../anime/text');

const VIEW_PREV = 'animelist:view:prev';
const VIEW_NEXT = 'animelist:view:next';
const PICK = 'Pick an anime from the list. If the list was empty, try again in a minute.';
const NOT_ON_LIST = 'That anime is not on your list. Add it with /animelist set.';
const EDIT_ERRORS = Object.freeze({
    progress: 'Progress must be a whole number of episodes.',
    score: 'Scores go from 0.1 to 10. Use 0 to clear a score.',
    notes: "That note isn't allowed. Keep it to plain text.",
    rewatches: 'Rewatches must be a whole number from 0 to 999.',
    nothing: 'Give at least one thing to change: progress, score, notes, started, finished, or rewatches.',
    missing: NOT_ON_LIST,
});

function titled(title) {
    return neutralize(title, 200) || 'that anime';
}

function statusLabel(id) {
    const info = statusInfo(id);
    return info ? `${info.emoji} ${info.label}` : id;
}

function sortChoices() {
    return SORTS.map((id) => ({ name: id[0].toUpperCase() + id.slice(1), value: id }));
}

function animeOption(option, description = 'Which show.') {
    return option.setName('anime').setDescription(description).setRequired(true).setAutocomplete(true).setMaxLength(100);
}

// A date option: "-" clears it, nothing given leaves it alone.
function dateOption(raw) {
    if (raw == null) return { value: undefined };
    if (String(raw).trim() === '-') return { value: null };
    const at = parseDateText(raw);
    if (!at) return { error: 'Dates look like 2024-07-31, 2024-07, or 2024. Use - to clear one.' };
    return { value: at };
}

function statusMessage(result) {
    const title = titled(result.title);
    switch (result.status) {
        case 'watching': return `📺 **${title}** is on your watching list.`;
        case 'planning': return `🗓️ **${title}** is on your plan-to-watch list.`;
        case 'completed': return `✅ Marked **${title}** completed.`;
        case 'rewatching': return `🔁 Rewatching **${title}**. Log episodes with /animelist edit.`;
        case 'paused': return `⏸️ Paused **${title}**.`;
        case 'dropped': return `🗑️ Dropped **${title}**.`;
        default: return `Updated **${title}**.`;
    }
}

function entryEmbed(found, user, { owner = false } = {}) {
    const item = found.entry;
    const id = anilistId(item.anilistId);
    const fields = [
        { name: 'Status', value: statusLabel(found.status), inline: true },
        { name: 'Progress', value: (found.status === 'completed' ? progressText({ ...item, progress: item.progress || item.episodes }) : progressText(item)) || '—', inline: true },
        { name: 'Score', value: scoreText(item.score) ? `★${scoreText(item.score)}` : '—', inline: true },
        { name: 'Started', value: item.startedAt ? timestamp(item.startedAt, 'D') : '—', inline: true },
        { name: 'Finished', value: item.completedAt ? timestamp(item.completedAt, 'D') : '—', inline: true },
        { name: 'Rewatches', value: item.rewatches ? String(item.rewatches) : '0', inline: true },
    ];
    const facts = [formatLabel(item.format), item.year ? String(item.year) : '', (item.genres || []).slice(0, 4).join(', ')].filter(Boolean);
    if (facts.length) fields.push({ name: 'About', value: facts.join(' · ').slice(0, 1024), inline: false });
    // Notes stay with their owner.
    if (owner && item.notes) fields.push({ name: '📝 Your notes (only you see these)', value: neutralize(item.notes, 300) || '—', inline: false });
    if (item.recommended) fields.push({ name: '💌', value: 'Recommended by a friend', inline: false });
    return styledEmbed({
        title: `${neutralize(item.title, 200) || 'Anime'}`,
        url: id ? `https://anilist.co/anime/${id}` : undefined,
        description: `On ${personName(user)}'s list`,
        label: 'profile',
    }).addFields(fields);
}

function viewTitle(statusId, user) {
    const info = statusInfo(statusId);
    const name = personName(user);
    if (!info) return `🗂️ ${name}'s anime list`;
    return `${info.emoji} ${name}'s ${info.label.toLowerCase()} list`;
}

function targetFromOptions(interaction) {
    const requested = interaction.options.getUser('user');
    const target = requested || interaction.user;
    const self = Boolean(snowflake(target.id) && snowflake(target.id) === snowflake(interaction.user.id));
    const member = requested && typeof interaction.options.getMember === 'function'
        ? interaction.options.getMember('user')
        : (self ? interaction.member : null);
    return { target, self, member, sameGuild: self || Boolean(member) };
}

async function loadVisible(interaction, deps) {
    const who = targetFromOptions(interaction);
    const decide = deps.profileForViewer || profileForViewer;
    const decision = await decide(who.target.id, interaction.user.id, { sameGuild: who.sameGuild });
    if (decision.show) await (deps.noteIdentity || noteIdentity)(decision.profile, who.target, who.member);
    return { ...who, decision };
}

// Autocomplete for someone else's entries only offers a profile the viewer
// could open: their own, a member of this server, or a Global profile.
async function viewerCanSee(interaction, targetId, profile) {
    if (!profile) return false;
    if (targetId === interaction.user.id || profile.discoverable === true) return true;
    const cache = interaction.guild && interaction.guild.members && interaction.guild.members.cache;
    return Boolean(cache && typeof cache.has === 'function' && cache.has(targetId));
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('animelist')
        .setDescription('Your full anime list: status, progress, scores, notes, and stats.')
        .addSubcommand((sub) => sub
            .setName('set')
            .setDescription('Put a show on a list: watching, planning, completed, rewatching, paused, or dropped.')
            .addStringOption((option) => animeOption(option, 'Search AniList or pick one of yours.'))
            .addStringOption((option) => option
                .setName('status')
                .setDescription('Which list.')
                .setRequired(true)
                .addChoices(...statusChoices()))
            .addNumberOption((option) => option
                .setName('score')
                .setDescription('Optional score from 0.1 to 10.')
                .setMinValue(0)
                .setMaxValue(10)))
        .addSubcommand((sub) => sub
            .setName('edit')
            .setDescription('Change progress, score, notes, dates, or rewatches for a show.')
            .addStringOption((option) => animeOption(option))
            .addIntegerOption((option) => option.setName('progress').setDescription('Episodes watched.').setMinValue(0).setMaxValue(5000))
            .addNumberOption((option) => option.setName('score').setDescription('0.1 to 10. Use 0 to clear.').setMinValue(0).setMaxValue(10))
            .addStringOption((option) => option.setName('notes').setDescription('Private notes, only you see them. Use - to clear.').setMaxLength(300))
            .addStringOption((option) => option.setName('started').setDescription('Start date: 2024-07-31, 2024-07, or 2024. Use - to clear.').setMaxLength(10))
            .addStringOption((option) => option.setName('finished').setDescription('Finish date: 2024-07-31, 2024-07, or 2024. Use - to clear.').setMaxLength(10))
            .addIntegerOption((option) => option.setName('rewatches').setDescription('Times rewatched.').setMinValue(0).setMaxValue(999)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Take a show off whichever list it is on.')
            .addStringOption((option) => animeOption(option)))
        .addSubcommand((sub) => sub
            .setName('view')
            .setDescription('Browse a list, sorted how you like. Defaults to your whole list.')
            .addUserOption((option) => option.setName('user').setDescription('Whose list to view. Defaults to you.'))
            .addStringOption((option) => option
                .setName('status')
                .setDescription('Only one list. Defaults to all of them.')
                .addChoices({ name: 'All', value: 'all' }, ...statusChoices()))
            .addStringOption((option) => option
                .setName('sort')
                .setDescription('Order. Defaults to most recent.')
                .addChoices(...sortChoices())))
        .addSubcommand((sub) => sub
            .setName('entry')
            .setDescription("See one show on someone's list: status, progress, score, and dates.")
            .addStringOption((option) => animeOption(option))
            .addUserOption((option) => option.setName('user').setDescription('Whose list. Defaults to you.')))
        .addSubcommand((sub) => sub
            .setName('stats')
            .setDescription('Episodes and days watched, mean score, score spread, and top genres.')
            .addUserOption((option) => option.setName('user').setDescription('Whose stats. Defaults to you.')))),
    category: 'anime',
    replies: 'private',
    subcommandReplies: { view: 'public', entry: 'public', stats: 'public' },
    checkDisabledChannels: true,
    example: '/animelist set anime:Frieren status:Completed score:9.5',
    examples: {
        set: '/animelist set anime:Frieren status:Completed score:9.5',
        edit: '/animelist edit anime:Frieren progress:12 score:9',
        remove: '/animelist remove anime:Frieren',
        view: '/animelist view status:Completed sort:Score',
        entry: '/animelist entry anime:Frieren user:@user',
        stats: '/animelist stats user:@user',
    },
    async autocomplete(interaction, deps = {}) {
        const sub = interaction.options && typeof interaction.options.getSubcommand === 'function'
            ? interaction.options.getSubcommand(false)
            : '';
        const loadProfile = deps.getProfile || getProfile;
        if (sub === 'set') {
            await animeAutocomplete(interaction, deps);
            return;
        }
        if (sub === 'edit' || sub === 'remove' || sub === 'entry') {
            await respondWithin(interaction, async () => {
                let targetId = snowflake(interaction.user && interaction.user.id);
                if (sub === 'entry') {
                    const picked = interaction.options.get ? interaction.options.get('user') : null;
                    const other = snowflake(picked && picked.value);
                    if (other) targetId = other;
                }
                const profile = targetId ? await loadProfile(targetId) : null;
                if (!(await viewerCanSee(interaction, targetId, profile))) return [];
                const focused = interaction.options.getFocused(true);
                return libraryChoices(profile, focused && focused.value);
            }, []);
            return;
        }
        await respondWithin(interaction, async () => [], []);
    },
    async execute(interaction, _client, deps = {}) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'view') {
            const statusId = interaction.options.getString('status') || 'all';
            const sort = SORTS.includes(interaction.options.getString('sort')) ? interaction.options.getString('sort') : 'recent';
            const info = statusInfo(statusId);
            return (deps.presentUserList || presentUserList)(interaction, {
                commandName: 'animelist',
                title: (user) => viewTitle(statusId, user),
                empty: info ? `Nothing on this ${info.label.toLowerCase()} list yet.` : 'Nothing here yet. Add a show with /animelist set.',
                footerLabel: 'profile',
                prevId: VIEW_PREV,
                nextId: VIEW_NEXT,
                lines: (profile) => libraryLines(profile, info ? statusId : 'all', sort),
            });
        }

        if (sub === 'stats' || sub === 'entry') {
            await defer(interaction);
            const seen = await loadVisible(interaction, deps);
            if (!seen.decision.show) return finish(interaction, ephemeral(seen.decision.message));
            if (sub === 'stats') {
                return finish(interaction, { embeds: [statsEmbed(seen.decision.profile, seen.target)], allowedMentions: allowedMentions() });
            }
            const found = findEntry(seen.decision.profile, interaction.options.getString('anime'));
            if (!found) {
                return finish(interaction, ephemeral(seen.self ? NOT_ON_LIST : "That anime isn't on their list."));
            }
            return finish(interaction, { embeds: [entryEmbed(found, seen.target, { owner: seen.self })], allowedMentions: allowedMentions() });
        }

        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);
        const raw = interaction.options.getString('anime');

        if (sub === 'remove') {
            const result = removeEntry(profile, raw);
            if (!result.ok) return finish(interaction, ephemeral(NOT_ON_LIST));
            await profile.save();
            return finish(interaction, ephemeral(`Removed **${titled(result.entry.title)}** from your ${statusInfo(result.status).label.toLowerCase()} list.`));
        }

        if (sub === 'edit') {
            const started = dateOption(interaction.options.getString('started'));
            if (started.error) return finish(interaction, ephemeral(started.error));
            const finished = dateOption(interaction.options.getString('finished'));
            if (finished.error) return finish(interaction, ephemeral(finished.error));
            const before = findEntry(profile, raw);
            if (!before) return finish(interaction, ephemeral(NOT_ON_LIST));
            const patch = {
                progress: interaction.options.getInteger('progress'),
                score: interaction.options.getNumber('score'),
                notes: interaction.options.getString('notes'),
                rewatches: interaction.options.getInteger('rewatches'),
            };
            if (started.value !== undefined) patch.startedAt = started.value;
            if (finished.value !== undefined) patch.completedAt = finished.value;
            const result = editEntry(profile, before.entry.anilistId, patch);
            if (!result.ok) return finish(interaction, ephemeral(EDIT_ERRORS[result.reason] || NOT_ON_LIST));
            await profile.save();
            const scoreChanged = result.changed.includes('score') && result.entry.score;
            if (result.finished) {
                recordActivity(interaction, statusEvent(result));
            } else if (result.changed.includes('progress') && (result.entry.progress || 0) > (before.entry.progress || 0)
                && (result.status === 'watching' || result.status === 'rewatching')) {
                recordActivity(interaction, {
                    type: 'progress', anilistId: result.entry.anilistId, title: result.entry.title,
                    progress: result.entry.progress, episodes: result.entry.episodes, fromProgress: before.entry.progress || 0,
                    score: scoreChanged ? result.entry.score : undefined,
                });
            } else if (scoreChanged) {
                recordActivity(interaction, { type: 'score', anilistId: result.entry.anilistId, title: result.entry.title, score: result.entry.score });
            }
            const bits = [statusLabel(result.status)];
            const where = progressText(result.entry);
            if (where) bits.push(where);
            if (scoreText(result.entry.score)) bits.push(`★${scoreText(result.entry.score)}`);
            const lead = result.finished ? '🎉 Last episode logged, so it moved to completed.\n' : '';
            return finish(interaction, ephemeral(`${lead}Updated **${titled(result.entry.title)}** · ${bits.join(' · ')}`));
        }

        // set
        const statusId = interaction.options.getString('status');
        if (!statusInfo(statusId)) return finish(interaction, ephemeral('Pick one of the listed statuses.'));
        const score = interaction.options.getNumber('score');
        const own = findEntry(profile, raw);
        const media = own ? own.entry : await (deps.resolveAnime || resolveAnime)(raw);
        if (!media) return finish(interaction, ephemeral(PICK));
        const result = setStatus(profile, media, statusId);
        if (!result.ok && result.reason === 'full') {
            return finish(interaction, ephemeral(`Your ${statusInfo(statusId).label.toLowerCase()} list is full (${result.max}). Move or remove a show first.`));
        }
        let entry = result.entry;
        if (!result.ok && result.reason !== 'same') return finish(interaction, ephemeral(PICK));
        if (score != null) {
            const scored = editEntry(profile, media.anilistId || media.id, { score });
            if (!scored.ok) return finish(interaction, ephemeral(EDIT_ERRORS[scored.reason] || EDIT_ERRORS.score));
            entry = scored.entry;
        }
        if (!result.ok && score == null) {
            return finish(interaction, ephemeral(`**${titled(result.entry.title)}** is already on your ${statusInfo(statusId).label.toLowerCase()} list.`));
        }
        await profile.save();
        if (result.ok) recordActivity(interaction, statusEvent({ ...result, entry }));
        else recordActivity(interaction, { type: 'score', anilistId: entry.anilistId, title: entry.title, score: entry.score });
        const scoreLine = score != null && scoreText(entry.score) ? ` Scored ★${scoreText(entry.score)}.` : '';
        const message = result.ok ? statusMessage(result) : `Updated **${titled(entry.title)}**.`;
        return finish(interaction, ephemeral(`${message}${scoreLine}`));
    },
};
