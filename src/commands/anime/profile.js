const { SlashCommandBuilder } = require('discord.js');
const { componentReply, defer, finish, updateComponent } = require('../../utils/ack');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { isBotOrApp } = require('../../utils/botAccount');
const {
    MESSAGES,
    accountFor,
    fetchProfile,
    getLink,
    linkedSites,
} = require('../../anime/linkedProfiles');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { SWITCH_PREFIX, profilePayload } = require('../../anime/profileView');

const NOT_MEMBER = "That person isn't in this server. Profiles are shown per server.";
const NOT_LINKED_SELF = 'Link an account first with /link anilist or /link myanimelist, or look any public profile up with /findprofile.';
const NOT_LINKED = "That person hasn't linked an AniList or MyAnimeList account.";

function siteLabel(site) {
    return site === 'mal' ? 'MyAnimeList' : 'AniList';
}

// Loads the linked profile to show. Returns { error } with a private message,
// or what the view needs. Shared with /findprofile.
async function loadProfileView(target, member, { site = null, self = false, deps = {} } = {}) {
    const link = await (deps.getLink || getLink)(target.id);
    const sites = linkedSites(link);
    if (!sites.length) return { error: self ? NOT_LINKED_SELF : NOT_LINKED };
    if (site && !sites.includes(site)) return { error: `${self ? "You haven't" : "They haven't"} linked ${siteLabel(site)}.` };
    const current = site || sites[0];
    const load = (which) => (deps.fetchProfile || fetchProfile)(which, accountFor(link, which));
    const result = await load(current);
    if (!result.ok) return { error: MESSAGES[result.reason] || MESSAGES.unavailable };
    return { sites, current, load, result };
}

async function showProfile(interaction, target, member, options = {}) {
    const loaded = await loadProfileView(target, member, options);
    if (loaded.error) return finish(interaction, ephemeral(loaded.error));
    const { sites, load } = loaded;
    let { current, result } = loaded;
    const view = (disabled) => profilePayload(result.profile, target, { sites, cached: result.cached, disabled });
    if (sites.length < 2) return finish(interaction, view(false));
    const message = await replyMenu(interaction, view(false));
    return watchMenu({
        message,
        interaction,
        commandName: interaction.commandName || 'profile',
        disabledView: () => view(true),
        onCollect: async (component) => {
            const next = typeof component.customId === 'string' && component.customId.startsWith(SWITCH_PREFIX)
                ? component.customId.slice(SWITCH_PREFIX.length)
                : null;
            if (!next || !sites.includes(next) || next === current) return false;
            const loaded = await load(next);
            if (!loaded.ok) {
                await componentReply(component, ephemeral(MESSAGES[loaded.reason] || MESSAGES.unavailable));
                return false;
            }
            current = next;
            result = loaded;
            await updateComponent(component, view(false));
            return false;
        },
    });
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('profile')
        .setDescription("Show your linked AniList or MyAnimeList profile, or a server member's.")
        .addUserOption((option) => option.setName('user').setDescription('A member of this server. Defaults to you.'))
        .addStringOption((option) => option
            .setName('site')
            .setDescription('Which linked account. Defaults to AniList when both are linked.')
            .addChoices({ name: 'AniList', value: 'anilist' }, { name: 'MyAnimeList', value: 'mal' }))),
    category: 'anime',
    configKey: 'AnimeCommandStatus',
    replies: 'public',
    checkDisabledChannels: true,
    example: '/profile user:@user site:AniList',
    showProfile,
    loadProfileView,
    async execute(interaction, _client, deps = {}) {
        await defer(interaction);
        const requested = interaction.options.getUser('user');
        const self = !requested || snowflake(requested.id) === snowflake(interaction.user.id);
        const target = self ? interaction.user : requested;
        const member = self
            ? interaction.member
            : (typeof interaction.options.getMember === 'function' ? interaction.options.getMember('user') : null);
        if (!self && isBotOrApp(target)) return finish(interaction, ephemeral("Bots don't have anime profiles."));
        if (!self && !member) return finish(interaction, ephemeral(NOT_MEMBER));
        return showProfile(interaction, target, member, { site: interaction.options.getString('site'), self, deps });
    },
};
