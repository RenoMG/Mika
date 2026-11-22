const { redact } = require('../utils/redact');
const { searchAnime, getAnime } = require('./client');
const { displayTitle } = require('./embed');
const { anilistId } = require('./ids');
const { pickTitle } = require('./match');
const { containsSlur, neutralize } = require('./text');

function choicesFrom(results) {
    const choices = [];
    const seen = new Set();
    for (const media of results || []) {
        const value = anilistId(media && media.id);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        const name = neutralize(displayTitle(media), 100);
        if (!name) continue;
        choices.push({ name, value });
        if (choices.length >= 25) break;
    }
    return choices;
}

async function animeAutocomplete(interaction) {
    const focused = interaction.options && typeof interaction.options.getFocused === 'function'
        ? interaction.options.getFocused()
        : '';
    const text = typeof focused === 'string' ? focused.trim() : '';
    if (text.length < 2 || containsSlur(text)) {
        await interaction.respond([]);
        return;
    }
    try {
        const results = await searchAnime(text);
        await interaction.respond(choicesFrom(results));
    } catch (error) {
        console.error(redact(error));
        try {
            if (!interaction.responded) await interaction.respond([]);
        } catch (respondError) {
            console.error(redact(respondError));
        }
    }
}

async function resolveAnime(raw) {
    if (typeof raw !== 'string' || containsSlur(raw)) return null;
    const direct = anilistId(raw);
    if (direct) {
        const media = await getAnime(direct);
        return media && anilistId(media.id) ? media : null;
    }
    const text = raw.trim();
    if (text.length < 2) return null;
    const results = await searchAnime(text);
    const match = pickTitle(text, results);
    if (!match || !anilistId(match.id)) return null;
    return match;
}

module.exports = { choicesFrom, animeAutocomplete, resolveAnime };
