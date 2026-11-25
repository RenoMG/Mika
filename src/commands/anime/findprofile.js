const { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } = require('discord.js');
const { componentReply, defer, finish, updateComponent } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { respondWithin } = require('../../anime/autocomplete');
const { snowflake } = require('../../anime/ids');
const { searchLinks } = require('../../anime/linkedProfiles');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');
const { loadProfileView, showProfile } = require('./profile');
const { profilePayload } = require('../../anime/profileView');

const QUERY_MAX = 32;
const PICK_ID = 'findprofile:pick';
const NOT_FOUND = 'No linked profile in this server matched that.';

function label(row) {
    const parts = [];
    if (row.anilist && row.anilist.name) parts.push(`AniList: ${row.anilist.name}`);
    if (row.mal && row.mal.name) parts.push(`MAL: ${row.mal.name}`);
    return {
        name: (neutralize(row.nameLabel, 50) || 'Member').slice(0, 100),
        description: parts.join(' · ').slice(0, 100),
    };
}

// Only people in this server. The member cache is enough for autocomplete;
// a command can afford one fetch for the rest.
async function inThisServer(guild, rows, { fetch = true } = {}) {
    const ids = [...new Set((rows || []).map((row) => snowflake(row && row.userId)).filter(Boolean))];
    const found = new Set();
    if (!guild || !guild.members || !ids.length) return found;
    const missing = [];
    for (const id of ids) {
        if (guild.members.cache && guild.members.cache.has(id)) found.add(id);
        else missing.push(id);
    }
    if (fetch && missing.length && typeof guild.members.fetch === 'function') {
        try {
            const fetched = await guild.members.fetch({ user: missing });
            if (fetched && typeof fetched.keys === 'function') for (const id of fetched.keys()) found.add(id);
        } catch (error) {
            // Members that cannot be fetched stay hidden.
        }
    }
    return found;
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('findprofile')
        .setDescription('Find a linked anime profile in this server by name or AniList/MyAnimeList username.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('A Discord name, or an AniList or MyAnimeList username.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(QUERY_MAX))),
    category: 'anime',
    replies: 'public',
    checkDisabledChannels: true,
    example: '/findprofile query:reno',
    async autocomplete(interaction, deps = {}) {
        await respondWithin(interaction, async () => {
            const focused = interaction.options.getFocused(true);
            const text = String(focused && focused.value || '').trim();
            if (text.length < 2 || containsSlur(text)) return [];
            const rows = await (deps.searchLinks || searchLinks)(text);
            const members = await inThisServer(interaction.guild, rows, { fetch: false });
            return rows
                .filter((row) => members.has(row.userId))
                .slice(0, 25)
                .map((row) => {
                    const shown = label(row);
                    return { name: `${shown.name}${shown.description ? ` · ${shown.description}` : ''}`.slice(0, 100), value: row.userId };
                });
        }, []);
    },
    async execute(interaction, client, deps = {}) {
        await defer(interaction);
        const raw = interaction.options.getString('query');
        if (typeof raw !== 'string' || !raw.trim()) return finish(interaction, ephemeral('Give me a name to search for.'));
        if (containsSlur(raw)) return finish(interaction, ephemeral(BLOCKED));
        const guild = interaction.guild;
        const fetchMember = async (id) => {
            if (!guild || !guild.members) return null;
            const cached = guild.members.cache && guild.members.cache.get(id);
            if (cached) return cached;
            try { return await guild.members.fetch(id); } catch (error) { return null; }
        };
        const open = async (target, id) => {
            const member = await fetchMember(id);
            if (!member) return finish(target, ephemeral(NOT_FOUND));
            return showProfile(target, member.user || { id }, member, { self: id === interaction.user.id, deps });
        };

        const picked = snowflake(raw.trim());
        if (picked) return open(interaction, picked);

        const rows = await (deps.searchLinks || searchLinks)(raw.trim());
        const members = await inThisServer(guild, rows);
        const matches = rows.filter((row) => members.has(row.userId)).slice(0, 25);
        if (!matches.length) return finish(interaction, ephemeral(NOT_FOUND));
        if (matches.length === 1) return open(interaction, matches[0].userId);

        const view = (disabled) => ({
            content: `🔎 Linked profiles matching **${neutralize(raw, QUERY_MAX) || 'that'}**. Pick one below.`,
            components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
                .setCustomId(PICK_ID)
                .setPlaceholder('Choose a profile')
                .setDisabled(disabled)
                .addOptions(matches.map((row) => {
                    const shown = label(row);
                    const option = { label: shown.name, value: row.userId };
                    if (shown.description) option.description = shown.description;
                    return option;
                })))],
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, view(false));
        return watchMenu({
            message,
            interaction,
            commandName: 'findprofile',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId !== PICK_ID) return false;
                const id = snowflake(component.values && component.values[0]);
                if (!id || !members.has(id)) return false;
                // The menu message becomes the profile.
                const member = await fetchMember(id);
                const loaded = member
                    ? await loadProfileView(member.user || { id }, member, { self: id === interaction.user.id, deps })
                    : { error: NOT_FOUND };
                if (loaded.error) {
                    await componentReply(component, ephemeral(loaded.error));
                    return false;
                }
                await updateComponent(component, {
                    content: null,
                    ...profilePayload(loaded.result.profile, member.user || { id }, { cached: loaded.result.cached }),
                });
                return true;
            },
        });
    },
};
