const { SlashCommandBuilder } = require('discord.js');
const { isBotOrApp } = require('../../utils/botAccount');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { animeAutocomplete, resolveAnime } = require('../../anime/autocomplete');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { BOT, NOT_IN_SERVER, SELF, deliverRecommend } = require('../../anime/recommend');

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('recommend')
        .setDescription('Recommend an anime to someone in this server.')
        .addUserOption((option) => option.setName('target').setDescription('Who should get the recommendation.').setRequired(true))
        .addStringOption((option) => option
            .setName('anime')
            .setDescription('Anime to recommend.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(100))),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/recommend target:@user anime:Cowboy Bebop',
    autocomplete: animeAutocomplete,
    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        if (!target || !member) return interaction.reply(ephemeral(NOT_IN_SERVER));
        if (isBotOrApp(target)) return interaction.reply(ephemeral(BOT));
        if (snowflake(target.id) === snowflake(interaction.user && interaction.user.id)) {
            return interaction.reply(ephemeral(SELF));
        }
        const raw = interaction.options.getString('anime');
        const media = await resolveAnime(raw);
        if (!media) {
            return interaction.reply(ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = await deliverRecommend({
            senderId: interaction.user && interaction.user.id,
            targetId: target && target.id,
            senderName: interaction.member && interaction.member.displayName || interaction.user && interaction.user.username,
            targetName: (member && member.displayName) || (target && (target.globalName || target.username)),
            anilist: media.id,
            inGuild: Boolean(member),
            targetIsBot: isBotOrApp(target),
            guildId: interaction.guild && interaction.guild.id,
            media,
            send: (payload) => target.send(payload),
        });
        return interaction.reply(ephemeral(result.message));
    },
};
