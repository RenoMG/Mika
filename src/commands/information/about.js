const { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');
const { finish: finishReply } = require('../../utils/ack');
const { embed } = require('../../utils/style');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { RENO_LINKS } = require('../../about/links');

const DESCRIPTION = [
    "Mika is the in-house bot for **Reno's World**, made by Reno just for this server.",
    '',
    'Look up anime, show off your AniList or MyAnimeList profile, play Guess That Anime, earn XP as you chat, '
        + 'and catch every new post from [renos.world](https://renos.world) the moment it goes up.',
].join('\n');

function aboutView(client) {
    const avatar = client?.user?.displayAvatarURL?.({ size: 256 });
    const card = embed({ title: '🌸 About Mika', description: DESCRIPTION, label: 'about' })
        .addFields(
            {
                name: '🔗 Reno\'s links',
                value: RENO_LINKS.map((link) => `${link.emoji} [${link.label}](${link.url})${link.note ? ` — ${link.note}` : ''}`).join('\n').slice(0, 1024),
                inline: false,
            },
            { name: '❓ Commands', value: 'Use `/help` to see everything Mika can do.', inline: false },
        );
    if (avatar) card.setThumbnail(avatar);
    const buttons = RENO_LINKS.slice(0, 5).map((link) => new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(link.url)
        .setLabel(link.label.slice(0, 80))
        .setEmoji(link.emoji));
    return {
        embeds: [card],
        components: buttons.length ? [new ActionRowBuilder().addComponents(buttons)] : [],
        allowedMentions: allowedMentions(),
    };
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('about')
        .setDescription("Shows what Mika is, the bot made for Reno's World, and Reno's links.")),
    category: 'information',
    replies: 'public',
    configKey: 'InfoCommandStatus',
    checkDisabledChannels: true,
    example: '/about',
    aboutView,
    async execute(interaction) {
        await finishReply(interaction, aboutView(interaction.client));
    },
};
