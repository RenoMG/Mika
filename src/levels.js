const mongoose = require('mongoose');
const { redact } = require('./utils/redact');
const { storedId } = require('./utils/safeId');

// Same collection and fields as the discord-xp "Levels" model so existing XP documents keep working.
const LevelSchema = new mongoose.Schema({
  userID: { type: String },
  isBot: { type: Boolean, default: false },
  lastAwardAt: Date,
  guildID: { type: String },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
});

LevelSchema.index({ guildID: 1, userID: 1 }, { unique: true });
LevelSchema.index({ guildID: 1, xp: -1, userID: 1 });
const levels = mongoose.models.Levels || mongoose.model('Levels', LevelSchema);

function numericXp(xp) {
  const value = Number(xp);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

// discord-xp: level = floor(0.1 * sqrt(xp)), and xpFor(level) = level^2 * 100.
// One grant can cross several levels. The stored level is the level for the new total, not total + 1.
function levelForXp(xp) {
  return Math.floor(0.1 * Math.sqrt(numericXp(xp)));
}

class DiscordXp {
  static levelForXp(xp) {
    return levelForXp(xp);
  }

  static async awardXp(userId, guildId, xp, options = {}) {
    const userKey = storedId(userId, 'An user id');
    const guildKey = storedId(guildId, 'A guild id');
    const amount = parseInt(xp, 10);
    if (!Number.isFinite(amount) || amount === 0) throw new TypeError('An amount of xp was not provided/was invalid.');

    const filter = { userID: userKey, guildID: guildKey };
    if (options.cooldownMs) {
      filter.$or = [{ lastAwardAt: { $exists: false } }, { lastAwardAt: { $lte: new Date(options.now - options.cooldownMs) } }];
    }
    const update = [
      { $set: { userID: userKey, guildID: guildKey, ...(options.cooldownMs ? { lastAwardAt: new Date(options.now) } : {}), xp: { $max: [0, { $add: [{ $ifNull: ['$xp', 0] }, amount] }] }, lastUpdated: new Date() } },
      { $set: { level: { $floor: { $multiply: [0.1, { $sqrt: '$xp' }] } } } },
    ];
    let before;
    try {
      before = await levels.findOneAndUpdate(filter, update, { upsert: true, updatePipeline: true, returnDocument: 'before' });
    } catch (error) {
      if (error.code !== 11000) throw error;
      // The row exists but the cooldown filter skipped it, or a concurrent insert won.
      before = await levels.findOneAndUpdate(filter, update, { updatePipeline: true, returnDocument: 'before' });
      if (!before) return null;
    }
    const beforeXp = numericXp(before?.xp);
    return { beforeXp, afterXp: Math.max(0, beforeXp + amount) };
  }

  static async appendXp(userId, guildId, xp, options = {}) {
    const result = await this.awardXp(userId, guildId, xp, options);
    if (!result) return null;
    return levelForXp(result.afterXp) > levelForXp(result.beforeXp);
  }

  static async fetch(userId, guildId, fetchPosition = false) {
    const userKey = storedId(userId, 'An user id');
    const guildKey = storedId(guildId, 'A guild id');

    // Rank and level-up reads assume a row exists. Insert xp 0 / level 0 the first time.
    let user;
    try { user = await levels.findOneAndUpdate(
      { userID: userKey, guildID: guildKey },
      { $setOnInsert: { userID: userKey, guildID: guildKey, xp: 0, level: 0 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ); } catch (error) {
      if (error.code !== 11000) throw error;
      user = await levels.findOne({ userID: userKey, guildID: guildKey });
    }
    if (!user) return false;

    user.xp = numericXp(user.xp);
    user.level = levelForXp(user.xp);

    if (fetchPosition === true) {
      user.position = await this.rankPosition(userKey, guildKey, user.xp);
    }

    user.cleanXp = user.xp - this.xpFor(user.level);
    user.cleanNextLevelXp = this.xpFor(user.level + 1) - this.xpFor(user.level);

    return user;
  }

  static async fetchLeaderboard(guildId, limit, { after, exclude = [], offset = 0 } = {}) {
    const guildKey = storedId(guildId, 'A guild id');
    if (!limit) throw new TypeError('A limit was not provided.');

    const filter = { isBot: { $ne: true }, guildID: guildKey, userID: { $nin: [...exclude] } };
    if (after) filter.$or = [{ xp: { $lt: after.xp } }, { xp: after.xp, userID: { $gt: after.userID } }];
    return levels.find(filter)
      .sort({ xp: -1, userID: 1 }).skip(offset)
      .limit(Number.isFinite(limit) ? Math.max(1, Math.min(100, limit)) : 100).lean().exec();
  }

  static async rankPosition(userId, guildId, xp, exclude = []) {
    return 1 + await levels.countDocuments({ isBot: { $ne: true }, guildID: guildId, userID: { $nin: [...exclude] },
      $or: [{ xp: { $gt: xp } }, { xp, userID: { $lt: userId, $nin: [...exclude] } }] });
  }

  static async computeLeaderboard(client, leaderboard, options = {}) {
    if (!client) throw new TypeError('A client was not provided.');
    if (!leaderboard) throw new TypeError('A leaderboard id was not provided.');

    if (!Array.isArray(leaderboard) || leaderboard.length < 1) return [];

    const knownBotIds = options.knownBotIds instanceof Set
      ? options.knownBotIds
      : new Set(options.knownBotIds || []);
    const computedArray = [];

    for (const key of leaderboard) {
      if (!key || !key.userID) continue;
      // Known bots are dropped even when the user fetch fails, so they cannot
      // hold a slot. A fetch that fails for anyone else means they left.
      if (knownBotIds.has(String(key.userID))) continue;

      let user = null;
      try {
        if (client.users && typeof client.users.fetch === 'function') {
          user = client.users.cache?.get(key.userID) || await client.users.fetch(key.userID);
        }
      } catch (error) {
        user = null;
      }

      if (user && (user.bot === true || user.system === true)) {
        if (mongoose.connection.readyState === 1) await levels.updateOne({ userID: key.userID, guildID: key.guildID }, { $set: { isBot: true } });
        continue;
      }

      const departed = !user || !user.username;
      computedArray.push({
        guildID: key.guildID,
        userID: key.userID,
        xp: numericXp(key.xp),
        level: levelForXp(key.xp),
        position: computedArray.length + 1,
        username: departed ? 'Unknown user' : user.username,
        discriminator: !departed && user.discriminator ? user.discriminator : '0',
        departed,
      });
    }

    return computedArray;
  }

  static xpFor(targetLevel) {
    const level = parseInt(targetLevel, 10);
    if (!Number.isFinite(level)) throw new TypeError('Target level should be a valid number.');
    if (level < 0) throw new RangeError('Target level should be a positive number.');
    return level * level * 100;
  }
}

module.exports = DiscordXp;
