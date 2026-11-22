const { Colors, EmbedBuilder, MessageFlags, SlashCommandBuilder } = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');

const IMAGE_TIMEOUT_MS = 8000;
const IMAGE_ERROR = "Couldn't fetch an image right now.";

// Keyless public APIs. shibe.online (the old shibe, bird, and cat host) answers
// 502 over HTTP and fails TLS, so those three use other hosts.
const SOURCES = {
    shibe: {
        title: 'SHIBE',
        footer: 'Mika | 🐕 Random Shibe',
        url: 'https://dog.ceo/api/breed/shiba/images/random',
        pick: (body) => (body && body.status === 'success' ? body.message : ''),
    },
    bird: {
        title: 'BIRD',
        footer: 'Mika | 🐥 Random Bird',
        url: 'https://some-random-api.com/animal/bird',
        pick: (body) => (body ? body.image : ''),
    },
    cat: {
        title: 'CAT',
        footer: 'Mika | 🐈 Random cat',
        url: 'https://api.thecatapi.com/v1/images/search',
        pick: (body) => (Array.isArray(body) && body[0] ? body[0].url : ''),
    },
    dog: {
        title: 'DOG',
        footer: 'Mika | 🐶 Random Dog',
        url: 'https://dog.ceo/api/breeds/image/random',
        pick: (body) => (body ? body.message : ''),
    },
    duck: {
        title: 'DUCK',
        footer: 'Mika | 🦆 Random Duck',
        url: 'https://random-d.uk/api/v2/random?format=json',
        // The API still returns an http image URL. The same path serves the
        // picture over https, which is what Discord will embed.
        pick: (body) => (body && typeof body.url === 'string'
            ? body.url.replace(/^http:\/\/random-d\.uk\//i, 'https://random-d.uk/')
            : ''),
    },
    fox: {
        title: 'FOX',
        footer: 'Mika | 🦊 Random Fox',
        url: 'https://randomfox.ca/floof/',
        pick: (body) => (body ? body.image : ''),
    },
};

function isImageUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
}

async function fetchImageUrl(source) {
    const response = await fetch(source.url, {
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
        headers: {
            Accept: 'application/json',
            'User-Agent': 'Mika Discord Bot',
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const image = source.pick(await response.json());
    if (!isImageUrl(image)) throw new Error('Image URL missing');
    return image;
}

async function replyMissing(interaction) {
    if (interaction.replied || interaction.deferred) return;
    await interaction.reply({ content: IMAGE_ERROR, flags: MessageFlags.Ephemeral });
}

module.exports = {
    IMAGE_TIMEOUT_MS,
    IMAGE_ERROR,
    SOURCES,
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('image')
        .setDescription('Returns a random image.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('shibe')
                .setDescription("Returns random image of a shibe."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bird')
                .setDescription("Returns random image of a bird."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cat')
                .setDescription("Returns random image of a cat."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('dog')
                .setDescription("Returns random image of a dog."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('duck')
                .setDescription("Returns random image of a duck."))
        .addSubcommand(subcommand =>
            subcommand
                .setName('fox')
                .setDescription("Returns random image of a fox."))),
    category: 'image',
    configKey: 'ImageCommandStatus',
    checkDisabledChannels: false,
    example: '/image dog',
    async execute(interaction) {
        const name = interaction.options.getSubcommand();
        const source = SOURCES[name];
        if (!source) return interaction.reply('no subcommand was used.');

        try {
            const image = await fetchImageUrl(source);
            const userEmbed = new EmbedBuilder()
                .setColor(Colors.Blue)
                .setTitle(source.title)
                .setImage(image)
                .setFooter({ text: source.footer, iconURL: `${process.env.MIKAICON}` })
                .setTimestamp();
            await interaction.reply({ embeds: [userEmbed] });
        } catch (error) {
            console.error(`Image command ${source.title} failed.`, error);
            try {
                await replyMissing(interaction);
            } catch (replyError) {
                console.error('Image error reply failed.', replyError);
            }
        }
    },
};
