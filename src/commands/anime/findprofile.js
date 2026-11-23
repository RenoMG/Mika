const { ActionRowBuilder, MessageFlags, SlashCommandBuilder, StringSelectMenuBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const {
    NOT_FOUND,
    QUERY_MAX,
    SETUP_FIRST,
    noteIdentity,
    profileAutocomplete,
    profileChoices,
    profileForViewer,
    searchProfiles,
} = require('../../anime/profiles');
const { profileEmbed } = require('../../anime/profileView');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');

const PICK_ID = 'anime:profile';

function profileRow(profiles, disabled) {
    const options = profileChoices(profiles);
    if (!options.length) return [];
    return [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(PICK_ID)
            .setPlaceholder('Choose a profile')
            .setDisabled(disabled)
            .addOptions(options),
    )];
}

function miss(decision) {
    return decision && decision.message === SETUP_FIRST ? SETUP_FIRST : NOT_FOUND;
}

async function openProfile(interaction, client, decision) {
    const id = snowflake(decision.profile && decision.profile.userId);
    let user = { id, username: (decision.profile && decision.profile.nameLabel) || 'User' };
    let member = null;
    try {
        if (client && client.users && typeof client.users.fetch === 'function' && id) {
            user = await client.users.fetch(id);
        }
    } catch (error) {
        user = { id, username: (decision.profile && decision.profile.nameLabel) || 'User' };
    }
    const guild = interaction.guild;
    if (guild && guild.members && typeof guild.members.fetch === 'function' && id) {
        try {
            member = await guild.members.fetch(id);
        } catch (error) {
            member = null;
        }
    }
    await noteIdentity(decision.profile, user, member);
    const card = profileEmbed(decision.profile, user, { self: decision.self });
    if (decision.profile.discoverable === true) return card;
    return { ...card, flags: MessageFlags.Ephemeral };
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('findprofile')
        .setDescription('Search public anime profiles by name.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('A name, show, genre, tag, or user id.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(QUERY_MAX))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/findprofile query:mecha',
    autocomplete: profileAutocomplete,
    async execute(interaction, client, deps = {}) {
        const raw = interaction.options.getString('query');
        if (typeof raw !== 'string' || !raw.trim()) return interaction.reply(ephemeral('Give me something to search for.'));
        if (containsSlur(raw)) return interaction.reply(ephemeral(BLOCKED));
        await defer(interaction);
        const text = raw.trim();
        const viewerId = interaction.user && interaction.user.id;
        const decide = deps.profileForViewer || profileForViewer;
        const search = deps.searchProfiles || searchProfiles;
        const picked = snowflake(text);
        if (picked) {
            const decision = await decide(picked, viewerId);
            if (!decision.show) return finish(interaction, ephemeral(miss(decision)));
            const card = await openProfile(interaction, client, decision);
            return finish(interaction, card);
        }

        const profiles = await search(text);
        if (!profiles.length) return finish(interaction, ephemeral(NOT_FOUND));

        const view = (disabled) => ({
            content: `Public profiles matching **${neutralize(text, QUERY_MAX) || 'that'}**.`,
            components: profileRow(profiles, disabled),
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, view(false));
        watchMenu({
            message,
            interaction,
            commandName: 'findprofile',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId !== PICK_ID) return false;
                const id = snowflake(component.values && component.values[0]);
                const decision = await profileForViewer(id, viewerId);
                if (!decision.show) {
                    await component.reply(ephemeral(miss(decision)));
                    return false;
                }
                const card = await openProfile(component, client, decision);
                const publicCard = { ...card };
                delete publicCard.flags;
                await component.update({ content: null, components: [], ...publicCard });
                return true;
            },
        });
    },
};
