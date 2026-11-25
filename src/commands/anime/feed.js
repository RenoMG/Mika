const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { respondWithin } = require('../../anime/autocomplete');
const {
    FOLLOW_MESSAGES,
    MAX_FOLLOWING,
    follow,
    followerCount,
    following,
    unfollow,
} = require('../../anime/feed');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { allowedMentions } = require('../../utils/mentions');
const { embed: styledEmbed } = require('../../utils/style');
const { profileForViewer } = require('../../anime/profiles');
const { isBotOrApp } = require('../../utils/botAccount');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('feed')
        .setDescription('Follow people to get their anime list updates by DM.')
        .addSubcommand((sub) => sub
            .setName('follow')
            .setDescription('Get DMs when someone updates their list. They must allow followers.')
            .addUserOption((option) => option.setName('user').setDescription('Who to follow.').setRequired(true)))
        .addSubcommand((sub) => sub
            .setName('unfollow')
            .setDescription('Stop getting someone\'s updates.')
            .addStringOption((option) => option
                .setName('user')
                .setDescription('Someone you follow.')
                .setRequired(true)
                .setAutocomplete(true)
                .setMaxLength(64)))
        .addSubcommand((sub) => sub
            .setName('following')
            .setDescription('See who you follow and how many people follow you.'))),
    category: 'anime',
    replies: 'private',
    checkDisabledChannels: true,
    example: '/feed follow user:@user',
    examples: {
        follow: '/feed follow user:@user',
        unfollow: '/feed unfollow user:Reno',
        following: '/feed following',
    },
    async autocomplete(interaction, deps = {}) {
        await respondWithin(interaction, async () => {
            const list = await (deps.following || following)(interaction.user.id);
            const focused = interaction.options.getFocused(true);
            const needle = String(focused && focused.value || '').trim().toLowerCase();
            return list
                .filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.id.includes(needle))
                .slice(0, 25)
                .map((row) => ({ name: row.name.slice(0, 100), value: row.id }));
        }, []);
    },
    async execute(interaction, _client, deps = {}) {
        const sub = interaction.options.getSubcommand();
        await defer(interaction, { ephemeral: true });
        const viewerId = snowflake(interaction.user && interaction.user.id);

        if (sub === 'follow') {
            const target = interaction.options.getUser('user');
            if (!target) return finish(interaction, ephemeral(FOLLOW_MESSAGES.missing));
            if (isBotOrApp(target)) return finish(interaction, ephemeral("Bots don't have anime lists."));
            if (target.id === viewerId) return finish(interaction, ephemeral(FOLLOW_MESSAGES.self));
            // Following needs the same reach as opening the profile.
            const sameGuild = typeof interaction.options.getMember === 'function' && Boolean(interaction.options.getMember('user'));
            const decision = await (deps.profileForViewer || profileForViewer)(target.id, viewerId, { sameGuild });
            if (!decision.show) return finish(interaction, ephemeral(decision.message));
            const result = await (deps.follow || follow)(viewerId, target.id);
            if (!result.ok) return finish(interaction, ephemeral(FOLLOW_MESSAGES[result.reason] || FOLLOW_MESSAGES.missing));
            return finish(interaction, ephemeral(`🔔 Following **${result.name || 'them'}**. Their list updates will arrive by DM. Stop anytime with /feed unfollow or the button on any update.`));
        }

        if (sub === 'unfollow') {
            const raw = interaction.options.getString('user');
            const targetId = snowflake(String(raw || '').replace(/[<@!>]/g, ''));
            if (!targetId) return finish(interaction, ephemeral('Pick someone from the list.'));
            const result = await (deps.unfollow || unfollow)(viewerId, targetId);
            return finish(interaction, ephemeral(result.ok ? '🔕 Unfollowed.' : "You don't follow them."));
        }

        const [list, followers] = await Promise.all([
            (deps.following || following)(viewerId),
            (deps.followerCount || followerCount)(viewerId),
        ]);
        const shown = list.slice(0, 40).map((row) => `• ${row.name}${row.active ? '' : ' · followers off, no updates'}`);
        if (list.length > shown.length) shown.push(`+${list.length - shown.length} more`);
        const embed = styledEmbed({
            title: `🔔 You follow ${list.length}/${MAX_FOLLOWING}`,
            description: shown.join('\n') || "You don't follow anyone yet. Try /feed follow.",
            label: 'feed',
        }).addFields({ name: 'Your followers', value: `**${followers}**`, inline: true });
        return finish(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral, allowedMentions: allowedMentions() });
    },
};
