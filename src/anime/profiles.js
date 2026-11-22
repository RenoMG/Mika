const AnimeProfile = require('../Models/AnimeProfile');
const { PendingRecommendation } = require('../Models/AnimeRecommend');
const { snowflake } = require('./ids');

const HIDDEN = "That profile isn't available.";
const SETUP_FIRST = 'Create a profile with /setup first.';

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getProfile(userId) {
    const id = snowflake(userId);
    if (!id) return null;
    return AnimeProfile.findOne({ userId: id });
}

async function profileForViewer(targetId, viewerId) {
    const viewer = snowflake(viewerId);
    const target = snowflake(targetId);
    if (!viewer || !target) return { show: false, message: HIDDEN };
    const profile = await getProfile(target);
    if (viewer === target) {
        if (!profile) return { show: false, message: SETUP_FIRST, self: true };
        return { show: true, profile, self: true };
    }
    if (!profile || profile.discoverable !== true) return { show: false, message: HIDDEN };
    return { show: true, profile, self: false };
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
        { genres: { $regex: pattern, $options: 'i' } },
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
    escapeRegex,
    getProfile,
    profileForViewer,
    searchProfiles,
    deleteProfile,
};
