const { ActionRowBuilder, SlashCommandBuilder, StringSelectMenuBuilder } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { profileForViewer, searchProfiles } = require('../../anime/profiles');
const { profileEmbed } = require('../../anime/profileView');
const { BLOCKED, containsSlur, neutralize } = require('../../anime/text');

const PICK_ID = 'anime:profile';

function profileRow(profiles, disabled) {
    const options = [];
    const seen = new Set();
    for (const profile of profiles || []) {
        const value = snowflake(profile && profile.userId);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        const label = neutralize(profile.favoriteTitle || profile.watching || profile.bio, 80) || 'Anime profile';
        options.push({
            label: label.slice(0, 100),
            value,
            description: 'Public profile',
        });
        if (options.length >= 10) break;
    }
    if (!options.length) return [];
    return [new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(PICK_ID)
            .setPlaceholder('Choose a profile')
            .setDisabled(disabled)
            .addOptions(options),
    )];
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('findprofile')
        .setDescription('Search public anime profiles.')
        .addStringOption((option) => option
            .setName('query')
            .setDescription('Bio, show, genre, tag, or user id.')
            .setRequired(true)
            .setMaxLength(80))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/findprofile query:mecha',
    async execute(interaction, client) {
        const raw = interaction.options.getString('query');
        if (typeof raw !== 'string' || !raw.trim()) return interaction.reply(ephemeral('Give me something to search for.'));
        if (containsSlur(raw)) return interaction.reply(ephemeral(BLOCKED));

        const profiles = await searchProfiles(raw.trim());
        if (!profiles.length) return interaction.reply(ephemeral('No public profile matched that.'));

        const view = (disabled) => ({
            content: `Public profiles matching **${neutralize(raw, 80) || 'that'}**.`,
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
                const decision = await profileForViewer(id, interaction.user && interaction.user.id);
                if (!decision.show) {
                    await component.reply(ephemeral(decision.message));
                    return false;
                }
                let user = { id, username: 'User' };
                try {
                    if (client && client.users && typeof client.users.fetch === 'function') {
                        user = await client.users.fetch(id);
                    }
                } catch (error) {
                    user = { id, username: 'User' };
                }
                const card = profileEmbed(decision.profile, user, { self: decision.self });
                await component.update({ content: null, components: [], ...card });
                return true;
            },
        });
    },
};
