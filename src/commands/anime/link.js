const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    SlashCommandBuilder,
} = require('discord.js');
const { defer, deferComponent, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { embed: styledEmbed, timestamp } = require('../../utils/style');
const {
    MESSAGES,
    SITES,
    getLink,
    linkedSites,
    startLink,
    unlink,
    validUsername,
    verifyLink,
} = require('../../anime/linkedProfiles');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');

const VERIFY_RE = /^link:v:(anilist|mal):(\d{17,20})$/;
const NOT_YOURS = 'This button belongs to someone else. Start your own with /link.';
const SUB_SITE = { anilist: 'anilist', myanimelist: 'mal' };

function verifyRow(site, userId) {
    const info = SITES[site];
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`link:v:${site}:${userId}`)
            .setLabel('Verify')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setLabel(`Open ${info.label} settings`)
            .setStyle(ButtonStyle.Link)
            .setURL(info.settingsUrl),
    );
}

function instructions(started) {
    const info = SITES[started.site];
    return styledEmbed({
        title: `🔗 Link ${info.label}: ${started.username}`,
        description: [
            `To prove this ${info.label} account is yours, add this code to your profile:`,
            `\`\`\`${started.code}\`\`\``,
            `1. Open your ${info.label} settings and paste the code anywhere in **${info.bioField}**.`,
            '2. Save, then press **Verify** here.',
            '3. Once it works, you can delete the code.',
            '',
            `The code expires ${timestamp(started.expiresAt, 'R')}. Mika only reads your public profile and never stores your lists.`,
        ].join('\n'),
        label: 'profile',
    });
}

function isLinkButton(customId) {
    return typeof customId === 'string' && VERIFY_RE.test(customId);
}

async function handleLinkButton(interaction, deps = {}) {
    const match = VERIFY_RE.exec(interaction.customId || '');
    const userId = snowflake(interaction.user && interaction.user.id);
    if (!match || !userId) return;
    if (match[2] !== userId) {
        await interaction.reply({ content: NOT_YOURS, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    await deferComponent(interaction);
    const result = await (deps.verifyLink || verifyLink)(userId, match[1]);
    if (!result.ok) {
        await interaction.followUp({ content: MESSAGES[result.reason] || MESSAGES.unavailable, flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
        return;
    }
    const info = SITES[result.site];
    await interaction.editReply({
        embeds: [styledEmbed({
            title: `✅ ${info.label} linked`,
            description: `**${result.name}** is now on your /profile. You can remove the code from your bio.`,
            label: 'profile',
            color: 'success',
        })],
        components: [],
        allowedMentions: allowedMentions(),
    });
}

function usernameOption(sub, site) {
    return sub.addStringOption((option) => option
        .setName('username')
        .setDescription(`Your ${SITES[site].label} username.`)
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(20));
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('link')
        .setDescription('Links your AniList or MyAnimeList account so /profile can show it.')
        .addSubcommand((sub) => usernameOption(sub
            .setName('anilist')
            .setDescription('Links your public AniList profile. You prove it is yours with a bio code.'), 'anilist'))
        .addSubcommand((sub) => usernameOption(sub
            .setName('myanimelist')
            .setDescription('Links your public MyAnimeList profile. You prove it is yours with a bio code.'), 'mal'))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Unlinks an account. Mika forgets it right away.')
            .addStringOption((option) => option
                .setName('site')
                .setDescription('Which account to unlink.')
                .setRequired(true)
                .addChoices(
                    { name: 'AniList', value: 'anilist' },
                    { name: 'MyAnimeList', value: 'mal' },
                    { name: 'Both', value: 'all' },
                )))
        .addSubcommand((sub) => sub
            .setName('status')
            .setDescription('Shows which accounts you have linked.'))),
    category: 'anime',
    configKey: 'AnimeCommandStatus',
    replies: 'private',
    checkDisabledChannels: true,
    example: '/link anilist username:Reno',
    examples: {
        anilist: '/link anilist username:Reno',
        myanimelist: '/link myanimelist username:Reno',
        remove: '/link remove site:Both',
        status: '/link status',
    },
    async execute(interaction, _client, deps = {}) {
        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const sub = interaction.options.getSubcommand();

        if (sub === 'status') {
            const link = await (deps.getLink || getLink)(userId);
            const sites = linkedSites(link);
            const lines = Object.values(SITES).map((info) => {
                const row = link && link[info.id];
                return row && row.name ? `🟢 **${info.label}:** ${row.name}` : `⚪ **${info.label}:** not linked`;
            });
            const hint = sites.length ? 'Show it with /profile.' : 'Link one with /link anilist or /link myanimelist.';
            return finish(interaction, ephemeral(`${lines.join('\n')}\n${hint}`));
        }

        if (sub === 'remove') {
            const site = interaction.options.getString('site');
            const result = await (deps.unlink || unlink)(userId, site);
            return finish(interaction, ephemeral(result.ok ? '🔓 Unlinked. Mika no longer shows that account.' : 'Nothing to unlink there.'));
        }

        const site = SUB_SITE[sub];
        const username = validUsername(site, interaction.options.getString('username'));
        if (!username) return finish(interaction, ephemeral(MESSAGES.username));
        const started = await (deps.startLink || startLink)(userId, site, username);
        if (!started.ok) return finish(interaction, ephemeral(MESSAGES[started.reason] || MESSAGES.unavailable));
        return finish(interaction, {
            embeds: [instructions(started)],
            components: [verifyRow(site, userId)],
            flags: MessageFlags.Ephemeral,
            allowedMentions: allowedMentions(),
        });
    },
    isLinkButton,
    handleLinkButton,
};
