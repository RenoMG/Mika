const { redact } = require('../utils/redact');
const { ready } = require('./cacheConnection');

async function ensureCacheIndexes() {
    if (!ready()) return;
    const AnimeCache = require('../Models/AnimeCache').get();
    const GuessAnime = require('../Models/GuessAnime').get();
    if (AnimeCache) await AnimeCache.createIndexes();
    if (GuessAnime) await GuessAnime.createIndexes();
    const GuessCharacter = require('../Models/GuessCharacter').get();
    if (GuessCharacter) await GuessCharacter.createIndexes();
}

module.exports = { ensureCacheIndexes };
