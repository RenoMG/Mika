const { componentReply } = require('../../utils/ack');
const { defer, replyWithMessage } = require('../../utils/ack');
const { finish: finishReply } = require('../../utils/ack');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    SlashCommandBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { applySlashDefaults } = require('../../utils/slashCommand');
const { redact } = require('../../utils/redact');
const { isQuietError } = require('../../utils/interactionErrors');
const { snowflake } = require('../../anime/ids');
const { ephemeral } = require('../../anime/menu');
const { SETUP_FIRST, getProfile, noteIdentity } = require('../../anime/profiles');
const { BIO_MAX, sanitizeUserText } = require('../../anime/text');

const BIO_INPUT = 'bio';
const GENERIC_ERROR = 'There was an error while executing this command!';

function bioModalId(userId) {
    return `bio:edit:${userId}`;
}

function parseBioModal(customId) {
    if (typeof customId !== 'string') return null;
    const match = /^bio:edit:(\d{17,20})$/.exec(customId);
    if (!match) return null;
    return { userId: match[1] };
}

function isBioModalId(customId) {
    return typeof customId === 'string' && customId.startsWith('bio:edit:');
}

function buildBioModal(userId, current) {
    const input = new TextInputBuilder()
        .setCustomId(BIO_INPUT)
        .setLabel('Bio')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(BIO_MAX)
        .setPlaceholder('A short bio');
    const prefill = typeof current === 'string' ? current.slice(0, BIO_MAX) : '';
    if (prefill.length > 0) input.setValue(prefill);
    return new ModalBuilder()
        .setCustomId(bioModalId(userId))
        .setTitle('Edit your bio')
        .addComponents(new ActionRowBuilder().addComponents(input));
}

async function replyQuiet(interaction, payload) {
    try {
        if (interaction.deferred) await finishReply(interaction, payload);
        else if (interaction.replied) await interaction.followUp(payload);
        else await finishReply(interaction, payload);
    } catch (error) {
        if (!isQuietError(error)) throw error;
    }
}

async function submitBio(interaction) {
    const parsed = parseBioModal(interaction && interaction.customId);
    const userId = snowflake(interaction && interaction.user && interaction.user.id);
    if (!parsed || !userId || !interaction.guild || typeof interaction.guild.id !== 'string') {
        await replyQuiet(interaction, ephemeral('This command only works in a server.'));
        return;
    }
    if (userId !== parsed.userId) {
        await replyQuiet(interaction, ephemeral('Only the person who used /bio can submit this.'));
        return;
    }
    await defer(interaction, { ephemeral: true });
    const profile = await getProfile(userId);
    if (!profile) {
        await replyQuiet(interaction, ephemeral(SETUP_FIRST));
        return;
    }
    if (!interaction.fields || typeof interaction.fields.getTextInputValue !== 'function') {
        await replyQuiet(interaction, ephemeral('Send some text.'));
        return;
    }
    let raw;
    try {
        raw = interaction.fields.getTextInputValue(BIO_INPUT);
    } catch (error) {
        await replyQuiet(interaction, ephemeral('Send some text.'));
        return;
    }
    if (typeof raw !== 'string') {
        await replyQuiet(interaction, ephemeral('Send some text.'));
        return;
    }
    if (raw.length > BIO_MAX) {
        await replyQuiet(interaction, ephemeral(`Keep it under ${BIO_MAX} characters.`));
        return;
    }
    const cleaned = sanitizeUserText(raw, BIO_MAX);
    if (cleaned.error) {
        await replyQuiet(interaction, ephemeral(cleaned.error));
        return;
    }
    await noteIdentity(profile, interaction.user, interaction.member);
    profile.bio = cleaned.text;
    await profile.save();
    await replyQuiet(interaction, ephemeral('Bio saved.'));
}

async function handleBioModal(interaction) {
    try {
        await submitBio(interaction);
    } catch (error) {
        if (isQuietError(error)) return;
        console.error(redact(error));
        try {
            await replyQuiet(interaction, ephemeral(GENERIC_ERROR));
        } catch (replyError) {
            if (!isQuietError(replyError)) console.error(redact(replyError));
        }
    }
}

module.exports = {
    data: applySlashDefaults(new SlashCommandBuilder()
        .setName('bio')
        .setDescription('Edit the bio on your anime profile.')),
    category: 'anime',
    checkDisabledChannels: true,
    example: '/bio',
    BIO_MAX,
    buildBioModal,
    isBioModalId,
    handleBioModal,
    async execute(interaction) {
        const userId = snowflake(interaction.user && interaction.user.id);
        if (!interaction.guild || !userId) {
            return finishReply(interaction, ephemeral('This command only works in a server.'));
        }
        await defer(interaction, { ephemeral: true });
        const profile = await getProfile(userId);
        if (!profile) return finishReply(interaction, ephemeral(SETUP_FIRST));
        await noteIdentity(profile, interaction.user, interaction.member);
        const current = typeof profile.bio === 'string' ? profile.bio : '';
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(`bio:open:${userId}`).setLabel('Edit bio').setStyle(ButtonStyle.Primary));
        const message = await replyWithMessage(interaction, { content: 'Edit your anime profile bio.', components: [row] });
        if (!message?.createMessageComponentCollector) return;
        const collector = message.createMessageComponentCollector({ time: 120000 });
        collector.on('collect', async (component) => {
            try {
                if (component.user.id !== userId) return componentReply(component, ephemeral('This button is not for you.'));
                await component.showModal(buildBioModal(userId, current));
            } catch (error) { if (!isQuietError(error)) console.error(redact(error)); }
        });
        collector.on('end', () => interaction.editReply({ components: [] }).catch(() => {}));
    },
};
