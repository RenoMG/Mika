const AnimeProfile = require('../Models/AnimeProfile');
const { PendingRecommendation } = require('../Models/AnimeRecommend');
const { snowflake } = require('./ids');

const HIDDEN = "That profile isn't available.";
const SETUP_FIRST = 'Create a profile with /setup first.';
const NOT_SETUP = "That person hasn't set up an anime profile.";

function visibilityFor({ self, sameGuild, hasProfile, discoverable }) {
    if (self) {
        if (!hasProfile) return { show: false, ephemeral: true, reason: 'setup' };
        return { show: true, ephemeral: false, reason: 'self' };
    }
    if (sameGuild && hasProfile) return { show: true, ephemeral: false, reason: 'guild' };
    if (hasProfile && discoverable) return { show: true, ephemeral: false, reason: 'discoverable' };
    if (sameGuild) return { show: false, ephemeral: true, reason: 'missing' };
    return { show: false, ephemeral: true, reason: 'hidden' };
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getProfile(userId) {
    const id = snowflake(userId);
    if (!id) return null;
    return AnimeProfile.findOne({ userId: id });
}

async function profileForViewer(targetId, viewerId, options = {}) {
    const viewer = snowflake(viewerId);
    const target = snowflake(targetId);
    if (!viewer || !target) return { show: false, ephemeral: true, message: HIDDEN };
    const profile = await getProfile(target);
    const decision = visibilityFor({
        self: viewer === target,
        sameGuild: options.sameGuild === true || viewer === target,
        hasProfile: Boolean(profile),
        discoverable: Boolean(profile && profile.discoverable === true),
    });
    if (!decision.show) {
        const message = decision.reason === 'setup'
            ? SETUP_FIRST
            : (decision.reason === 'missing' ? NOT_SETUP : HIDDEN);
        return { show: false, ephemeral: true, self: decision.reason === 'setup', message };
    }
    return { show: true, ephemeral: false, profile, self: decision.reason === 'self' };
}

async function searchProfiles(query) {
    if (typeof query !== 'string') return [];
    const text = query.trim().slice(0, 80);
    if (!text) return [];
    const pattern = escapeRegex(text);
    const clauses = [
        { bio: { $regex: pattern, $options: 'i' } },
        { watching: { $regex: pattern, $options: 'i' } },
        { favoriteTitle: { $regex: pattern, $options: 'i' } },
        { 'favorites.title': { $regex: pattern, $options: 'i' } },
        { genres: { $regex: pattern, $options: 'i' } },
        { tags: { $regex: pattern, $options: 'i' } },
    ];
    const id = snowflake(text);
    if (id) clauses.push({ userId: id });
    return AnimeProfile.find({
        discoverable: true,
        userId: { $type: 'string' },
        $or: clauses,
    }).limit(10);
}

async function deleteProfile(userId) {
    const id = snowflake(userId);
    if (!id) return false;
    await AnimeProfile.deleteOne({ userId: id });
    await PendingRecommendation.deleteMany({
        $or: [{ targetId: id }, { senderId: id }],
    });
    return true;
}

module.exports = {
    HIDDEN,
    SETUP_FIRST,
    NOT_SETUP,
    escapeRegex,
    visibilityFor,
    getProfile,
    profileForViewer,
    searchProfiles,
    deleteProfile,
};
