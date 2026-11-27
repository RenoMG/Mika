// Rank (/level) and level-up cards. Both share one look: a flat dark purple
// card, the avatar on the left, and a solid lavender progress bar. @napi-rs/canvas is required only when a card is drawn, so a
// missing binary does not stop the bot from booting.
const path = require('node:path');

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 300;
const CARD_RADIUS = 24;
const AVATAR_DIAMETER = 168;
const AVATAR_LEFT = 60;
const AVATAR_BYTES = 512 * 1024;
const TEXT_LEFT = AVATAR_LEFT + AVATAR_DIAMETER + 52;
const TEXT_RIGHT = CARD_WIDTH - 52;

// Flat dark purple with one lavender accent. No gradients or glows.
const THEME = Object.freeze({
    background: '#1d1629',
    accent: '#b794f6',
    ring: '#3a2d52',
    text: '#f4effb',
    muted: '#a497b8',
    track: '#2e2440',
    border: '#2e2440',
});

// Inter ships with the bot (src/assets/fonts, SIL OFL) so cards look the same on
// every host. System fonts are the fallback if the files cannot be loaded.
const FONT_ALIAS = 'Mika Inter';
const FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts');
const BUNDLED_FONTS = ['Inter-Regular.otf', 'Inter-SemiBold.otf', 'Inter-Bold.otf'];
const FALLBACK_FAMILIES = ['Inter', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans'];
const FALLBACK_FILES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
];

let fontStack = null;

function loadCanvas() {
    try {
        return require('@napi-rs/canvas');
    } catch (error) {
        const failure = new Error('Canvas module is unavailable.');
        failure.cause = error;
        throw failure;
    }
}

function whole(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number < 0) return 0;
    return number;
}

function number(value) {
    return whole(value).toLocaleString('en-US');
}

function levelUpLabel(from, to) {
    return `${whole(from)} → ${whole(to)}`;
}

function avatarCenter() {
    return {
        x: AVATAR_LEFT + (AVATAR_DIAMETER / 2),
        y: CARD_HEIGHT / 2,
    };
}

// Avatars only come from Discord's CDN. Anything else is refused so a card
// cannot be pointed at an internal or arbitrary host.
const AVATAR_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

function isAvatarUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && AVATAR_HOSTS.has(url.hostname);
    } catch (error) {
        return false;
    }
}

function ensureFont(GlobalFonts) {
    if (fontStack) return fontStack;
    const families = [];
    let bundled = false;
    for (const file of BUNDLED_FONTS) {
        try {
            if (GlobalFonts.registerFromPath(path.join(FONT_DIR, file), FONT_ALIAS)) bundled = true;
        } catch (error) {
            // The bundled font is missing or unreadable here.
        }
    }
    if (bundled) families.push(`"${FONT_ALIAS}"`);
    for (const family of FALLBACK_FAMILIES) {
        try {
            if (GlobalFonts.has(family)) families.push(`"${family}"`);
        } catch (error) {
            // Font lookup can fail when the process has no font config.
        }
    }
    if (!families.length) {
        for (const file of FALLBACK_FILES) {
            try {
                if (GlobalFonts.registerFromPath(file, 'Mika Sans')) families.push('"Mika Sans"');
            } catch (error) {
                // That font file is not installed here.
            }
        }
        if (families.length) families.splice(1);
    }
    families.push('sans-serif');
    fontStack = families.join(', ');
    return fontStack;
}

function font(stack, size, weight = 400) {
    return `${weight} ${size}px ${stack}`;
}

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
    const value = String(text || 'Unknown user').replace(/\s+/g, ' ').trim() || 'Unknown user';
    if (ctx.measureText(value).width <= maxWidth) return value;
    let trimmed = value;
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed.trimEnd()}…`;
}

// A role color as a safe #rrggbb, or the accent.
function swatch(color) {
    return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : THEME.accent;
}

async function resolveAvatar(canvasLib, input) {
    if (input && input.avatarImage) return input.avatarImage;
    const url = input && input.avatarURL;
    if (!isAvatarUrl(url)) throw new Error('Avatar URL is missing.');
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (!response.ok) throw new Error(`Avatar request failed (${response.status}).`);
    if (Number(response.headers.get('content-length')) > AVATAR_BYTES) {
        await response.body?.cancel?.();
        throw new Error('Avatar payload is unusable.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 16 || bytes.length > AVATAR_BYTES) throw new Error('Avatar payload is unusable.');
    return canvasLib.loadImage(bytes);
}

// ---------------------------------------------------------------- shared pieces

// A flat rounded card with a thin border. Everything after this is clipped to it.
function drawBackground(ctx) {
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = THEME.background;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    // A slim accent strip down the left edge.
    ctx.fillStyle = THEME.accent;
    ctx.fillRect(0, 0, 6, CARD_HEIGHT);
}

function drawBorder(ctx) {
    ctx.restore();
    roundRect(ctx, 1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, CARD_RADIUS - 1);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawAvatar(ctx, image) {
    const { x, y } = avatarCenter();
    const radius = AVATAR_DIAMETER / 2;

    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fillStyle = THEME.ring;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const width = image.width || AVATAR_DIAMETER;
    const height = image.height || AVATAR_DIAMETER;
    const scale = Math.max(AVATAR_DIAMETER / width, AVATAR_DIAMETER / height);
    const dw = width * scale;
    const dh = height * scale;
    ctx.drawImage(image, x - (dw / 2), y - (dh / 2), dw, dh);
    ctx.restore();
}

function drawProgress(ctx, { left, right, y, height, current, needed }) {
    const width = right - left;
    roundRect(ctx, left, y, width, height, height / 2);
    ctx.fillStyle = THEME.track;
    ctx.fill();
    const goal = whole(needed);
    const ratio = goal > 0 ? Math.min(1, whole(current) / goal) : 0;
    const fill = Math.round(width * ratio);
    if (fill <= 0) return;
    roundRect(ctx, left, y, Math.min(width, Math.max(fill, height)), height, height / 2);
    ctx.fillStyle = THEME.accent;
    ctx.fill();
}

// A small muted label over a value, right-aligned at `right`. Returns its width.
function drawStat(ctx, stack, { label, value, right, accent = false }) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 18, 500);
    const labelWidth = ctx.measureText(label).width;
    ctx.fillStyle = THEME.muted;
    ctx.fillText(label, right, 62);
    ctx.font = font(stack, 40, 700);
    const valueWidth = ctx.measureText(value).width;
    ctx.fillStyle = accent ? THEME.accent : THEME.text;
    ctx.fillText(value, right, 106);
    return Math.max(valueWidth, labelWidth);
}

// A colored dot and a line of muted text, starting at `left`.
function drawRoleLine(ctx, stack, { text, color, left, y, maxWidth }) {
    ctx.beginPath();
    ctx.arc(left + 6, y - 6, 6, 0, Math.PI * 2);
    ctx.fillStyle = swatch(color);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 20, 500);
    ctx.fillStyle = THEME.muted;
    ctx.fillText(fitText(ctx, text, maxWidth - 20), left + 20, y);
}

// ---------------------------------------------------------------- cards

function paintRank(ctx, stack, spec) {
    const level = whole(spec.level);
    const rank = whole(spec.rank);
    const current = whole(spec.current);
    const needed = whole(spec.needed);

    // Stats, right to left: level, then rank.
    let right = TEXT_RIGHT;
    right -= drawStat(ctx, stack, { label: 'Level', value: number(level), right, accent: true }) + 40;
    right -= drawStat(ctx, stack, { label: 'Rank', value: rank > 0 ? `#${number(rank)}` : '—', right }) + 36;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 40, 700);
    ctx.fillStyle = THEME.text;
    ctx.fillText(fitText(ctx, spec.displayName, right - TEXT_LEFT), TEXT_LEFT, 106);

    // XP numbers over the bar, right-aligned.
    ctx.textAlign = 'right';
    ctx.font = font(stack, 20, 500);
    ctx.fillStyle = THEME.muted;
    const goal = needed > 0 ? ` / ${number(needed)} XP` : ' XP';
    ctx.fillText(goal, TEXT_RIGHT, 172);
    const goalWidth = ctx.measureText(goal).width;
    ctx.font = font(stack, 20, 600);
    ctx.fillStyle = THEME.text;
    ctx.fillText(number(current), TEXT_RIGHT - goalWidth, 172);

    drawProgress(ctx, { left: TEXT_LEFT, right: TEXT_RIGHT, y: 186, height: 16, current, needed });

    // Under the bar: the next level role, or the total XP.
    const next = spec.next && spec.next.name ? spec.next : null;
    if (next) {
        drawRoleLine(ctx, stack, {
            text: `Next role: ${next.name} at level ${number(next.level)}`,
            color: next.color,
            left: TEXT_LEFT,
            y: 242,
            maxWidth: TEXT_RIGHT - TEXT_LEFT,
        });
    } else if (spec.totalXp != null) {
        ctx.textAlign = 'left';
        ctx.font = font(stack, 20, 500);
        ctx.fillStyle = THEME.muted;
        ctx.fillText(`${number(spec.totalXp)} XP total`, TEXT_LEFT, 242);
    }
}

function paintLevelUp(ctx, stack, spec) {
    const from = whole(spec.from);
    const to = whole(spec.to);
    const current = whole(spec.current);
    const needed = whole(spec.needed);

    // The new level on the right, the old one under it.
    let right = TEXT_RIGHT;
    right -= drawStat(ctx, stack, { label: from + 1 === to ? 'Level' : `Level ${number(from)} →`, value: number(to), right, accent: true }) + 40;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 18, 500);
    ctx.fillStyle = THEME.accent;
    ctx.fillText('Level up', TEXT_LEFT, 62);
    ctx.font = font(stack, 40, 700);
    ctx.fillStyle = THEME.text;
    ctx.fillText(fitText(ctx, spec.displayName, right - TEXT_LEFT), TEXT_LEFT, 106);

    ctx.textAlign = 'right';
    ctx.font = font(stack, 20, 500);
    ctx.fillStyle = THEME.muted;
    const caption = needed > 0
        ? `${number(current)} / ${number(needed)} XP to level ${number(to + 1)}`
        : `${number(current)} XP`;
    ctx.fillText(caption, TEXT_RIGHT, 172);
    drawProgress(ctx, { left: TEXT_LEFT, right: TEXT_RIGHT, y: 186, height: 16, current, needed });

    // Roles earned on this level-up, or else the next one to aim for.
    const rewards = Array.isArray(spec.rewards) ? spec.rewards.filter((reward) => reward && reward.name) : [];
    const line = { left: TEXT_LEFT, y: 242, maxWidth: TEXT_RIGHT - TEXT_LEFT };
    if (rewards.length) {
        const last = rewards[rewards.length - 1];
        const extra = rewards.length > 1 ? ` +${rewards.length - 1}` : '';
        drawRoleLine(ctx, stack, { ...line, text: `New role: ${last.name}${extra}`, color: last.color });
    } else if (spec.next && spec.next.name) {
        drawRoleLine(ctx, stack, { ...line, text: `Next role: ${spec.next.name} at level ${number(spec.next.level)}`, color: spec.next.color });
    }
}

function paint(canvasLib, image, spec, painter) {
    const canvas = canvasLib.createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const stack = ensureFont(canvasLib.GlobalFonts);
    drawBackground(ctx);
    drawAvatar(ctx, image);
    painter(ctx, stack, spec);
    drawBorder(ctx);
    return canvas.toBuffer('image/png');
}

async function renderRankCard(input = {}) {
    const canvasLib = loadCanvas();
    const image = await resolveAvatar(canvasLib, input);
    return paint(canvasLib, image, input, paintRank);
}

async function renderLevelUpCard(input = {}) {
    const canvasLib = loadCanvas();
    const image = await resolveAvatar(canvasLib, input);
    return paint(canvasLib, image, input, paintLevelUp);
}

module.exports = {
    CARD_WIDTH,
    CARD_HEIGHT,
    AVATAR_DIAMETER,
    avatarCenter,
    levelUpLabel,
    renderRankCard,
    renderLevelUpCard,
};
