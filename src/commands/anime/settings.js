const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { DELETE_ID, DELETE_NO, DELETE_YES, deleteRow } = require('../../anime/components');
const { snowflake } = require('../../anime/ids');
const { ephemeral, replyMenu, watchMenu } = require('../../anime/menu');
const { SETUP_FIRST, deleteProfile, getProfile } = require('../../anime/profiles');
const { settingsEmbed } = require('../../anime/profileView');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Change privacy, recommendations, or delete your profile.')
        .addBooleanOption((option) => option
            .setName('discoverable')
            .setDescription('Let other servers find and view your profile.')
            .setRequired(false))
        .addBooleanOption((option) => option
            .setName('recommendations')
            .setDescription('Let people recommend anime to you.')
            .setRequired(false))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/settings discoverable:False',
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        const profile = userId ? await getProfile(userId) : null;
        if (!profile) return interaction.reply(ephemeral(SETUP_FIRST));

        const discoverable = interaction.options.getBoolean('discoverable');
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
                    await component.update({
                        content: 'Delete your anime profile? This cannot be undone.',
                        ...view(false),
                        allowedMentions: allowedMentions(),
                    });
                    return false;
                }
                if (component.customId === DELETE_NO) {
                    confirm = false;
                    await component.update({ content: null, ...view(false), allowedMentions: allowedMentions() });
                    return false;
                }
                if (component.customId !== DELETE_YES) return false;
                await deleteProfile(userId);
                await component.update({
                    content: 'Your anime profile was deleted.',
                    embeds: [],
                    components: [],
                    allowedMentions: allowedMentions(),
                });
                return true;
            },
        });
    },
};
