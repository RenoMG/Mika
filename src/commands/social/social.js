const { Colors, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { stripIndents } = require('common-tags');
const entries = require('./data/entries');
const { applySlashDefaults } = require('../../utils/slashCommand');

const builder = new SlashCommandBuilder()
    .setName('social')
    .setDescription('Social based commands');

for (const entry of entries) {
    builder.addSubcommand((subcommand) => {
        subcommand.setName(entry.name).setDescription(entry.description);
        if (entry.option === 'user') {
            subcommand.addUserOption((option) => option.setName('target').setRequired(true).setDescription('The user mentioned.'));
        } else if (entry.option === 'question') {
            subcommand.addStringOption((option) => option.setName('question').setRequired(true).setDescription('Your question.'));
        }
        return subcommand;
    });
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function fill(text, interaction, member, saying) {
    return text
        .replaceAll('{user}', `${interaction.member.user}`)
        .replaceAll('{member}', `${member}`)
        .replaceAll('{saying}', saying ?? '');
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

    await interaction.reply({ embeds: [userEmbed] });
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
        return interaction.reply('Haha, you want to hack yourself? DENIED!');
    }

    await interaction.reply(`${sayingsdat2} <a:LoadingAnimated:828057628512092202>`);
    setTimeout(function () {
        interaction.editReply(`${sayingsdat1}`);
    }, 4000);
}

async function runEightBall(interaction, entry) {
    const response = pick(entry.responses);
    await interaction.reply('<a:LoadingAnimated:828057628512092202> Contacting Oracle...');
    setTimeout(function () {
        interaction.editReply(`<:8ball:828057590864805908> ~ ${response}`);
    }, 4000);
}

async function runRate(interaction) {
    const user = interaction.options.getUser('target');
    if (!user) return;
    const member = interaction.options.getMember('target');
    const rates = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const result = Math.floor((Math.random() * rates.length));

    const userEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setThumbnail(member.displayAvatarURL)
        .setTimestamp()
        .setDescription(stripIndents`**RATE**

                            I have finished rating ${member}, the results are in!
                            
                            **${member} - I rate you ${result}/10!**`)
        .setFooter({ text: 'Mika | 👽 RATE!', iconURL: `${process.env.MIKAICON}` });

    await interaction.reply({ embeds: [userEmbed] });
}

module.exports = {
    data: applySlashDefaults(builder),
    category: 'social',
    configKey: 'SocialCommandStatus',
    checkDisabledChannels: true,
    example: '/social hug target:@user',
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        const entry = entries.find((item) => item.name === sub);
        if (!entry) return interaction.reply('no subcommand was used.');

        if (entry.kind === 'gif') return runGif(interaction, entry);
        if (entry.kind === 'hack') return runHack(interaction, entry);
        if (entry.kind === 'eightball') return runEightBall(interaction, entry);
        if (entry.kind === 'rate') return runRate(interaction);

        return interaction.reply('no subcommand was used.');
    },
};
