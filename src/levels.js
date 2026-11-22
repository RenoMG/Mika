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

class DiscordXp {
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
    if (xp == 0 || !xp || isNaN(parseInt(xp))) throw new TypeError('An amount of xp was not provided/was invalid.');

    const user = await levels.findOne({ userID: userId, guildID: guildId });

    if (!user) {
      const newUser = new levels({
        userID: userId,
        guildID: guildId,
        xp: xp,
        level: Math.floor(0.1 * Math.sqrt(xp)),
      });

      await newUser.save().catch((e) => console.log(`Failed to save new user.`));

      return Math.floor(0.1 * Math.sqrt(xp)) > 0;
    }

    user.xp += parseInt(xp, 10);
    user.level = Math.floor(0.1 * Math.sqrt(user.xp));
    user.lastUpdated = new Date();

    await user.save().catch((e) => console.log(`Failed to append xp: ${e}`));

    // Level-up check from discord-xp: compare the new level to the level implied by the previous xp.
    return Math.floor(0.1 * Math.sqrt((user.xp -= xp))) < user.level;
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

    if (fetchPosition === true) {
      const leaderboard = await levels.find({ guildID: guildId }).sort({ xp: -1 }).exec();
      user.position = leaderboard.findIndex((i) => i.userID === userId) + 1;
    }

    user.cleanXp = user.xp - this.xpFor(user.level);
    user.cleanNextLevelXp = this.xpFor(user.level + 1) - this.xpFor(user.level);

    return user;
  }

  static async fetchLeaderboard(guildId, limit) {
    if (!guildId) throw new TypeError('A guild id was not provided.');
    if (!limit) throw new TypeError('A limit was not provided.');

    const users = await levels.find({ guildID: guildId }).sort({ xp: -1 }).exec();
    return users.slice(0, limit);
  }

  static async computeLeaderboard(client, leaderboard) {
    if (!client) throw new TypeError('A client was not provided.');
    if (!leaderboard) throw new TypeError('A leaderboard id was not provided.');

    if (leaderboard.length < 1) return [];

    const computedArray = [];

    // discord-xp only filled the leaderboard when more than one user was stored.
    if (leaderboard.length > 1) {
      for (const key of leaderboard) {
        const user = await client.users.fetch(key.userID);
        computedArray.push({
          guildID: key.guildID,
          userID: key.userID,
          xp: key.xp,
          level: key.level,
          position: leaderboard.findIndex((i) => i.guildID === key.guildID && i.userID === key.userID) + 1,
          username: user.username,
          discriminator: user.discriminator,
        });
      }
    }

    return computedArray;
  }

  static xpFor(targetLevel) {
    if (isNaN(targetLevel) || isNaN(parseInt(targetLevel, 10))) throw new TypeError('Target level should be a valid number.');
    if (isNaN(targetLevel)) targetLevel = parseInt(targetLevel, 10);
    if (targetLevel < 0) throw new RangeError('Target level should be a positive number.');
    return targetLevel * targetLevel * 100;
  }
}

module.exports = DiscordXp;
