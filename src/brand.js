const PLACEHOLDER_ICON =
  'https://renos.world/wp-content/uploads/2025/10/5a4e299d7d70aace-952x1024.jpg';

// Discord CDN avatar for application 795165717283471370, the previous bot avatar.
const LEGACY_AVATAR_PREFIX = 'https://cdn.discordapp.com/avatars/795165717283471370';

function isLegacyAvatar(url) {
  return typeof url === 'string' && url.startsWith(LEGACY_AVATAR_PREFIX);
}

function resolveIcon(url) {
  if (!url || isLegacyAvatar(url)) return PLACEHOLDER_ICON;
  return url;
}

// Prefer MIKA* env vars. RODGERDATABASE and RODGERICON still work so existing .env files boot.
// The old application avatar URL is not used as a footer icon.
function applyBrandEnv() {
  if (!process.env.MIKADATABASE && process.env.RODGERDATABASE) {
    process.env.MIKADATABASE = process.env.RODGERDATABASE;
  }

  const chosen = process.env.MIKAICON || process.env.RODGERICON;
  process.env.MIKAICON = resolveIcon(chosen);
}

function missingRequiredEnv() {
  const missing = [];
  if (!process.env.TOKEN) missing.push('TOKEN');
  if (!process.env.APPLICATIONID) missing.push('APPLICATIONID');
  if (!process.env.MIKADATABASE) missing.push('MIKADATABASE (or RODGERDATABASE)');
  return missing;
}

module.exports = {
  PLACEHOLDER_ICON,
  applyBrandEnv,
  missingRequiredEnv,
  resolveIcon,
};
