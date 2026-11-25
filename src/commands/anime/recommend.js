const { SlashCommandBuilder } = require('discord.js');
const { defer, finish } = require('../../utils/ack');
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
    replies: 'private',
    checkDisabledChannels: true,
    example: '/recommend target:@user anime:Cowboy Bebop',
    autocomplete: animeAutocomplete,
    async execute(interaction, _client, deps = {}) {
        await defer(interaction, { ephemeral: true });
        const target = interaction.options.getUser('target');
        const member = interaction.options.getMember('target');
        if (!target || !member) return finish(interaction, ephemeral(NOT_IN_SERVER));
        if (isBotOrApp(target)) return finish(interaction, ephemeral(BOT));
        if (snowflake(target.id) === snowflake(interaction.user && interaction.user.id)) {
            return finish(interaction, ephemeral(SELF));
        }
        const raw = interaction.options.getString('anime');
        const media = await (deps.resolveAnime || resolveAnime)(raw);
        if (!media) {
            return finish(interaction, ephemeral('Pick an anime from the list. If the list was empty, try again in a minute.'));
        }
        const result = await (deps.deliverRecommend || deliverRecommend)({
            senderId: interaction.user && interaction.user.id,
            targetId: target && target.id,
            senderName: interaction.member && interaction.member.displayName || interaction.user && interaction.user.username,
            targetName: (member && member.displayName) || (target && (target.globalName || target.username)),
            anilist: media.id,
            inGuild: Boolean(member),
            targetIsBot: isBotOrApp(target),
            guildId: interaction.guild && interaction.guild.id,
            guildName: interaction.guild && interaction.guild.name,
            media,
            send: (payload) => target.send(payload),
        });
        return finish(interaction, ephemeral(result.message));
    },
};
