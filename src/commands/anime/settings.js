const { updateComponent } = require('../../utils/ack');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { DELETE_ID, DELETE_NO, DELETE_YES, deleteRow } = require('../../anime/components');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { SETUP_FIRST, deleteProfile, getProfile, noteIdentity } = require('../../anime/profiles');
const { settingsEmbed } = require('../../anime/profileView');
const { addVisibilityOption, parseVisibility } = require('../../anime/visibility');

module.exports = {
    data: applySlashDefaults(addVisibilityOption(new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Change visibility, recommendations, or delete your profile.'), { required: false })
        .addBooleanOption((option) => option
            .setName('recommendations')
            .setDescription('Let people recommend anime to you.')
            .setRequired(false))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/settings visibility:Local',
    async execute(interaction, _client, deps = {}) {
        await defer(interaction, { ephemeral: true });
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await (deps.getProfile || getProfile)(userId) : null;
        if (!profile) return finish(interaction, ephemeral(SETUP_FIRST));
        await (deps.noteIdentity || noteIdentity)(profile, interaction.user, interaction.member);

        const discoverable = parseVisibility(interaction.options.getString('visibility'));
        const recommendations = interaction.options.getBoolean('recommendations');
        if (typeof discoverable === 'boolean') profile.discoverable = discoverable;
        if (typeof recommendations === 'boolean') profile.recommendations = recommendations;
        if (typeof discoverable === 'boolean' || typeof recommendations === 'boolean') await profile.save();

        let confirm = false;
        const view = (disabled) => ({
            embeds: [settingsEmbed(profile)],
            components: deleteRow({ disabled, confirm }),
            allowedMentions: allowedMentions(),
        });
        const message = await replyMenu(interaction, { ...view(false), flags: MessageFlags.Ephemeral });
        watchMenu({
            message,
            interaction,
            commandName: 'settings',
            disabledView: () => view(true),
            onCollect: async (component) => {
                if (component.customId === DELETE_ID) {
                    confirm = true;
                    await updateComponent(component, {
                        content: '⚠️ Delete your anime profile? This cannot be undone.',
                        ...view(false),
                        allowedMentions: allowedMentions(),
                    });
                    return false;
                }
                if (component.customId === DELETE_NO) {
                    confirm = false;
                    await updateComponent(component, { content: null, ...view(false), allowedMentions: allowedMentions() });
                    return false;
                }
                if (component.customId !== DELETE_YES) return false;
                await deleteProfile(userId);
                await updateComponent(component, {
                    content: '🗑️ Your anime profile was deleted.',
                    embeds: [],
                    components: [],
                    allowedMentions: allowedMentions(),
                });
                return true;
            },
        });
    },
};
