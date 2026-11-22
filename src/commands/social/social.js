const { Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const entries = require('./data/entries');
const { allowedMentions } = require('../../utils/mentions');
const { applySlashDefaults } = require('../../utils/slashCommand');

const QUESTION_MAX = 200;

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function fill(text, interaction, member, saying) {
    return text
        .replaceAll('{user}', `${interaction.member.user}`)
        .replaceAll('{member}', `${member}`)
        .replaceAll('{saying}', saying ?? '');
}

function mentionIds(interaction, member) {
    const ids = [];
    if (interaction.user) ids.push(interaction.user.id);
    if (member) ids.push(member.id || (member.user && member.user.id));
    return allowedMentions(...ids);
}

async function runGif(interaction, entry) {
    let member = null;
    if (entry.option === 'user') {
        const user = interaction.options.getUser('target');
        if (!user) return;
        member = interaction.options.getMember('target');
    }

    const image = pick(entry.images);
    const saying = entry.sayings ? pick(entry.sayings) : '';
    const userEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setImage(image)
        .setURL(image)
        .setTimestamp()
        .setDescription(fill(entry.text, interaction, member, saying))
        .setFooter({ text: entry.footer, iconURL: `${process.env.MIKAICON}` });

    await interaction.reply({ embeds: [userEmbed], allowedMentions: mentionIds(interaction, member) });
}

async function runHack(interaction, entry) {
    const user = interaction.options.getUser('target');
    if (!user) return;
    const member = interaction.options.getMember('target');

    // The previous command rolled a gif and never attached it. Keep that roll
    // so the following picks stay in the same place in the random sequence.
    pick(entry.images);
    const sayingsdat1 = fill(pick(entry.lines), interaction, member, '');
    const sayingsdat2 = pick(entry.loading);

    if (interaction.member.id === member.id) {
        return interaction.reply({
            content: 'Haha, you want to hack yourself? DENIED!',
            allowedMentions: allowedMentions(),
        });
    }

    const mentions = mentionIds(interaction, member);
    await interaction.reply({
        content: `${sayingsdat2} <a:LoadingAnimated:828057628512092202>`,
        allowedMentions: mentions,
    });
    setTimeout(function () {
        interaction.editReply({ content: `${sayingsdat1}`, allowedMentions: mentions });
    }, 4000);
}

async function runEightBall(interaction, entry) {
    const question = interaction.options.getString('question');
    if (typeof question !== 'string' || !question.trim() || question.length > QUESTION_MAX) {
        return interaction.reply({
            content: `Ask a question of up to ${QUESTION_MAX} characters.`,
            allowedMentions: allowedMentions(),
        });
    }
    const response = pick(entry.responses);
    const mentions = allowedMentions();
    await interaction.reply({
        content: '<a:LoadingAnimated:828057628512092202> Contacting Oracle...',
        allowedMentions: mentions,
    });
    setTimeout(function () {
        interaction.editReply({ content: `<:8ball:828057590864805908> ~ ${response}`, allowedMentions: mentions });
    }, 4000);
}

async function runRate(interaction) {
    const user = interaction.options.getUser('target');
    if (!user) return;
    const member = interaction.options.getMember('target');
    const rates = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const result = Math.floor((Math.random() * rates.length));
    const thumbnail = member && typeof member.displayAvatarURL === 'function'
        ? member.displayAvatarURL()
        : (member ? member.displayAvatarURL : undefined);

    const userEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setThumbnail(thumbnail)
        .setTimestamp()
        .setDescription(stripIndents`**RATE**

                            I have finished rating ${member}, the results are in!
                            
                            **${member} - I rate you ${result}/10!**`)
        .setFooter({ text: 'Mika | 👽 RATE!', iconURL: `${process.env.MIKAICON}` });

    await interaction.reply({ embeds: [userEmbed], allowedMentions: mentionIds(interaction, member) });
}

function exampleFor(entry) {
    if (entry.option === 'user') return `/${entry.name} target:@user`;
    if (entry.option === 'question') return `/${entry.name} question:will it rain`;
    return `/${entry.name}`;
}

function buildCommand(entry) {
    const builder = new SlashCommandBuilder().setName(entry.name).setDescription(entry.description);
    if (entry.option === 'user') {
        builder.addUserOption((option) => option.setName('target').setRequired(true).setDescription('The user mentioned.'));
    } else if (entry.option === 'question') {
        builder.addStringOption((option) => option
            .setName('question')
            .setRequired(true)
            .setDescription('Your question.')
            .setMaxLength(QUESTION_MAX));
    }
    return {
        data: applySlashDefaults(builder),
        category: 'social',
        configKey: 'SocialCommandStatus',
        checkDisabledChannels: true,
        example: exampleFor(entry),
        async execute(interaction) {
            if (entry.kind === 'gif') return runGif(interaction, entry);
            if (entry.kind === 'hack') return runHack(interaction, entry);
            if (entry.kind === 'eightball') return runEightBall(interaction, entry);
            if (entry.kind === 'rate') return runRate(interaction);
            return interaction.reply({ content: 'That command is not available.', allowedMentions: allowedMentions() });
        },
    };
}

module.exports = {
    commands: entries.map(buildCommand),
};
