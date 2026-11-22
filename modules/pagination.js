const { ActionRowBuilder, ButtonStyle } = require('discord.js');

// ButtonBuilder keeps style and custom id on `.data` (no public getters in discord.js 14).
const buttonStyle = (button) => button.style ?? button.data?.style;
const buttonCustomId = (button) => button.customId ?? button.data?.custom_id;

/**
 * Creates a pagination embed
 * @param {Interaction} interaction
 * @param {import('discord.js').EmbedBuilder[]} pages
 * @param {import('discord.js').ButtonBuilder[]} buttonList
 * @param {number} timeout
 * @returns
 */
const paginationEmbed = async (
  interaction,
  pages,
  buttonList,
  timeout = 120000
) => {
  if (!pages) throw new Error("Pages are not given.");
  if (!buttonList) throw new Error("Buttons are not given.");
  if (buttonStyle(buttonList[0]) === ButtonStyle.Link || buttonStyle(buttonList[1]) === ButtonStyle.Link)
    throw new Error(
      "Link buttons are not supported with discordjs-button-pagination"
    );
  if (buttonList.length !== 2) throw new Error("Need two buttons.");

  let page = 0;

  const row = new ActionRowBuilder().addComponents(buttonList);

  //has the interaction already been deferred? If not, defer the reply.
  if (interaction.deferred == false) {
    await interaction.deferReply();
  }

  const curPage = await interaction.editReply({
    embeds: [pages[page].setFooter({ text: `Page ${page + 1} / ${pages.length} - Made with 💖 by YAMAHA` , iconURL: `${process.env.MIKAICON}` })],
    components: [row],
    fetchReply: true,
  });

  const filter = (i) =>
    i.customId === buttonCustomId(buttonList[0]) ||
    i.customId === buttonCustomId(buttonList[1]);

  const collector = await curPage.createMessageComponentCollector({
    filter,
    time: timeout,
  });

  collector.on("collect", async (i) => {
    switch (i.customId) {
      case buttonCustomId(buttonList[0]):
        page = page > 0 ? --page : pages.length - 1;
        break;
      case buttonCustomId(buttonList[1]):
        page = page + 1 < pages.length ? ++page : 0;
        break;
      default:
        break;
    }
    await i.deferUpdate();
    await i.editReply({
      embeds: [pages[page].setFooter({ text: `Page ${page + 1} / ${pages.length} - Made with 💖 by YAMAHA` , iconURL: `${process.env.MIKAICON}` })],
      components: [row],
    });
    collector.resetTimer();
  });

  collector.on("end", (_, reason) => {
    if (reason !== "messageDelete") {
      const disabledRow = new ActionRowBuilder().addComponents(
        buttonList[0].setDisabled(true),
        buttonList[1].setDisabled(true)
      );
      curPage.edit({
        embeds: [pages[page].setFooter({ text: `Page ${page + 1} / ${pages.length} - Made with 💖 by YAMAHA` , iconURL: `${process.env.MIKAICON}` })],
        components: [disabledRow],
      });
    }
  });

  return curPage;
};
module.exports = paginationEmbed;