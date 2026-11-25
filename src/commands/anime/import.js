const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const AnilistLink = require('../../Models/AnilistLink');
const { defer, deferComponent, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { embed: styledEmbed, formatNumber, timestamp } = require('../../utils/style');
const {
    CODE_TTL_MS,
    MESSAGES,
    resyncLinked,
    startLink,
    validUsername,
    verifyAndImport,
} = require('../../anime/anilistImport');
const { recordActivity } = require('../../anime/feed');
const { snowflake } = require('../../anime/ids');
const { STATUSES } = require('../../anime/library');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');

const VERIFY_PREFIX = 'import:v:';
const VERIFY_RE = /^import:v:(\d{17,20})$/;
const NOT_YOURS = 'This button belongs to someone else. Start your own with /import anilist.';

function verifyRow(userId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${VERIFY_PREFIX}${userId}`)
            .setLabel('Verify and import')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setLabel('Open AniList settings')
            .setStyle(ButtonStyle.Link)
            .setURL('https://anilist.co/settings'),
    );
}

function instructions(started) {
    return styledEmbed({
        title: `📥 Link AniList: ${started.username}`,
        description: [
            'To prove this AniList account is yours, add this code to your AniList bio:',
            `\`\`\`${started.code}\`\`\``,
            '1. Open AniList settings and paste the code anywhere in **About**.',
            '2. Save, then press **Verify and import** here.',
            '3. Once it works, you can delete the code from your bio.',
            '',
            `The code expires ${timestamp(started.expiresAt, 'R')}. Only your public anime list is read; private entries and adult titles are skipped.`,
        ].join('\n'),
        label: 'import',
    });
}

function summaryEmbed(result) {
    const lines = STATUSES
        .filter((status) => result.counts[status.id])
        .map((status) => `${status.emoji} ${status.label}: **${formatNumber(result.counts[status.id])}**`);
    const extra = [];
    if (result.skipped) extra.push(`⚠️ ${formatNumber(result.skipped)} older shows did not fit Mika's list limits and were left out.`);
    if (result.customAdded) extra.push(`🗂️ Added ${result.customAdded} custom ${result.customAdded === 1 ? 'list' : 'lists'}.`);
    const favs = result.favorites || {};
    const favBits = [['anime', 'anime'], ['character', 'characters'], ['staff', 'staff'], ['studio', 'studios']]
        .filter(([key]) => favs[key])
        .map(([key, label]) => `${favs[key]} ${label}`);
    if (favBits.length) extra.push(`⭐ Favorites now: ${favBits.join(', ')}.`);
    extra.push(result.mode === 'replace'
        ? 'Mode: replace. Your six status lists now match AniList.'
        : 'Mode: merge. Shows only on Mika were kept; AniList won for shows on both.');
    extra.push('You can remove the code from your AniList bio now. Sync again anytime with /import anilist.');
    return styledEmbed({
        title: `📥 Imported ${formatNumber(result.imported)} shows from ${result.username}`,
        description: [...lines, '', ...extra].join('\n').slice(0, 4096),
        label: 'import',
        color: 'success',
    });
}

function failure(reason) {
    return MESSAGES[reason] || MESSAGES.unavailable;
}

function isImportButton(customId) {
    return typeof customId === 'string' && VERIFY_RE.test(customId);
}

async function handleImportButton(interaction, deps = {}) {
    const match = VERIFY_RE.exec(interaction.customId || '');
    const userId = snowflake(interaction.user && interaction.user.id);
    if (!match || !userId) return;
    if (match[1] !== userId) {
        await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    await deferComponent(interaction);
    const profile = await (deps.getProfile || getProfile)(userId);
    if (!profile) {
        await interaction.followUp({ content: SETUP_FIRST, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    const result = await (deps.verifyAndImport || verifyAndImport)(userId, profile);
    if (!result.ok) {
        await interaction.followUp({ content: failure(result.reason), flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    recordActivity(interaction, { type: 'import', count: result.imported });
    await interaction.editReply({ embeds: [summaryEmbed(result)], components: [], allowedMentions: allowedMentions() });
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('import')
        .setDescription('Bring your anime list over from AniList.')
        .addSubcommand((sub) => sub
            .setName('anilist')
            .setDescription('Import your public AniList anime list. You confirm it is yours with a bio code.')
            .addStringOption((option) => option
                .setName('username')
                .setDescription('Your AniList username.')
                .setRequired(true)
                .setMinLength(2)
                .setMaxLength(20))
            .addStringOption((option) => option
                .setName('mode')
                .setDescription('Merge keeps shows only on Mika. Replace makes your lists match AniList.')
                .addChoices(
                    { name: 'Merge (default)', value: 'merge' },
                    { name: 'Replace', value: 'replace' },
                )))
        .addSubcommand((sub) => sub
            .setName('unlink')
            .setDescription('Forget your linked AniList account. Your imported shows stay.'))),
    category: 'anime',
    replies: 'private',
    checkDisabledChannels: true,
    example: '/import anilist username:Reno',
    examples: {
        anilist: '/import anilist username:Reno mode:Merge',
        unlink: '/import unlink',
    },
    async execute(interaction, _client, deps = {}) {
        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);
        const sub = interaction.options.getSubcommand();
        const Link = deps.Link || AnilistLink;

        if (sub === 'unlink') {
            const had = Boolean(profile.anilist && profile.anilist.id);
            profile.anilist = undefined;
            await profile.save();
            await Link.deleteOne({ userId });
            return finish(interaction, ephemeral(had ? 'Unlinked your AniList account. Your lists were not changed.' : 'No AniList account is linked.'));
        }

        const username = validUsername(interaction.options.getString('username'));
        if (!username) return finish(interaction, ephemeral(MESSAGES.username));
        const mode = interaction.options.getString('mode') === 'replace' ? 'replace' : 'merge';
        const linked = profile.anilist && profile.anilist.id && typeof profile.anilist.name === 'string'
            && profile.anilist.name.toLowerCase() === username.toLowerCase();
        if (linked) {
            const result = await (deps.resyncLinked || resyncLinked)(userId, profile, { mode });
            if (!result.ok) return finish(interaction, ephemeral(failure(result.reason)));
            recordActivity(interaction, { type: 'import', count: result.imported });
            return finish(interaction, { embeds: [summaryEmbed(result)], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        }

        const started = await (deps.startLink || startLink)(userId, username, { mode, Link });
        if (!started.ok) return finish(interaction, ephemeral(failure(started.reason)));
        return finish(interaction, {
            embeds: [instructions(started)],
            components: [verifyRow(userId)],
            flags: MessageFlags.Ephemeral,
            allowedMentions: allowedMentions(),
        });
    },
    isImportButton,
    handleImportButton,
    summaryEmbed,
    CODE_TTL_MS,
};
