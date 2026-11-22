const mongoose = require('mongoose');

// Same collection and fields as the discord-xp "Levels" model so existing XP documents keep working.
const LevelSchema = new mongoose.Schema({
  userID: { type: String },
  guildID: { type: String },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: new Date() },
});

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

  static async setURL(dbUrl) {
    if (!dbUrl) throw new TypeError('A database url was not provided.');
    if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
      return mongoose.connection;
    }
    return mongoose.connect(dbUrl, { dbName: process.env.MIKADATABASENAME || 'mika' });
  }

  static async appendXp(userId, guildId, xp) {
    if (!userId) throw new TypeError('An user id was not provided.');
    if (!guildId) throw new TypeError('A guild id was not provided.');
    const amount = parseInt(xp, 10);
    if (!Number.isFinite(amount) || amount === 0) throw new TypeError('An amount of xp was not provided/was invalid.');

    const user = await levels.findOne({ userID: userId, guildID: guildId });

    if (!user) {
      const level = levelForXp(amount);
      const newUser = new levels({
        userID: userId,
        guildID: guildId,
        xp: amount,
        level,
      });

      await newUser.save().catch(() => console.log('Failed to save new user.'));

      return level > 0;
    }

    const previousLevel = levelForXp(user.xp);
    user.xp = numericXp(user.xp) + amount;
    user.level = levelForXp(user.xp);
    user.lastUpdated = new Date();

    await user.save().catch((e) => console.log(`Failed to append xp: ${e}`));

    return user.level > previousLevel;
  }

  static async fetch(userId, guildId, fetchPosition = false) {
    if (!userId) throw new TypeError('An user id was not provided.');
    if (!guildId) throw new TypeError('A guild id was not provided.');

    // Rank and level-up reads assume a row exists. Insert xp 0 / level 0 the first time.
    const user = await levels.findOneAndUpdate(
      { userID: userId, guildID: guildId },
      { $setOnInsert: { userID: userId, guildID: guildId, xp: 0, level: 0 } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
    if (!user) return false;

    user.xp = numericXp(user.xp);
    user.level = levelForXp(user.xp);

    if (fetchPosition === true) {
      const leaderboard = await levels.find({ guildID: guildId }).sort({ xp: -1 }).exec();
      const index = leaderboard.findIndex((entry) => entry && entry.userID === userId);
      user.position = index >= 0 ? index + 1 : leaderboard.length + 1;
    }

    user.cleanXp = user.xp - this.xpFor(user.level);
    user.cleanNextLevelXp = this.xpFor(user.level + 1) - this.xpFor(user.level);

    return user;
  }

  static async fetchLeaderboard(guildId, limit) {
    if (!guildId) throw new TypeError('A guild id was not provided.');
    if (!limit) throw new TypeError('A limit was not provided.');

    const users = await levels.find({ guildID: guildId }).sort({ xp: -1 }).exec();
    return users.filter((entry) => entry && entry.userID).slice(0, limit);
  }

  static async computeLeaderboard(client, leaderboard) {
    if (!client) throw new TypeError('A client was not provided.');
    if (!leaderboard) throw new TypeError('A leaderboard id was not provided.');

    if (!Array.isArray(leaderboard) || leaderboard.length < 1) return [];

    const computedArray = [];

    for (const key of leaderboard) {
      if (!key || !key.userID) continue;

      let user = null;
      try {
        if (client.users && typeof client.users.fetch === 'function') {
          user = await client.users.fetch(key.userID);
        }
      } catch (error) {
        user = null;
      }

      const departed = !user || !user.username;
      computedArray.push({
        guildID: key.guildID,
        userID: key.userID,
        xp: numericXp(key.xp),
        level: levelForXp(key.xp),
        position: leaderboard.findIndex((entry) => entry && entry.guildID === key.guildID && entry.userID === key.userID) + 1,
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
