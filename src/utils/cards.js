// Rank (/level) and level-up cards. Both share one look: a dark rounded card
// with a soft glow, the avatar in a gradient ring on the left, and a gradient
// progress bar. @napi-rs/canvas is required only when a card is drawn, so a
// missing binary does not stop the bot from booting.
const path = require('node:path');

const CARD_WIDTH = 1000;
const CARD_HEIGHT = 300;
const CARD_RADIUS = 32;
const AVATAR_DIAMETER = 184;
const AVATAR_LEFT = 58;
const AVATAR_BYTES = 512 * 1024;
const TEXT_LEFT = AVATAR_LEFT + AVATAR_DIAMETER + 52;
const TEXT_RIGHT = CARD_WIDTH - 52;

const THEME = Object.freeze({
    backgroundTop: '#151a33',
    backgroundBottom: '#0d1022',
    accent: '#5b8cff',
    accentEnd: '#c86bff',
    text: '#f7f8fc',
    muted: '#9aa5c4',
    faint: 'rgba(255, 255, 255, 0.07)',
    track: 'rgba(255, 255, 255, 0.09)',
    border: 'rgba(255, 255, 255, 0.08)',
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

function setSpacing(ctx, pixels) {
    // letterSpacing is newer than some canvas builds; without it text is just tighter.
    try {
        ctx.letterSpacing = `${pixels}px`;
    } catch (error) {
        // Unsupported here.
    }
}

function accentGradient(ctx, x0, y0, x1, y1) {
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, THEME.accent);
    gradient.addColorStop(1, THEME.accentEnd);
    return gradient;
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

function glow(ctx, x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
}

// The rounded card with its glow. Everything after this is clipped to it.
function drawBackground(ctx, { celebrate = false } = {}) {
    roundRect(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_RADIUS);
    ctx.save();
    ctx.clip();

    const base = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    base.addColorStop(0, THEME.backgroundTop);
    base.addColorStop(1, THEME.backgroundBottom);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const { x, y } = avatarCenter();
    glow(ctx, x, y, 260, THEME.accent, celebrate ? 0.45 : 0.3);
    glow(ctx, CARD_WIDTH - 80, -40, 340, THEME.accentEnd, celebrate ? 0.4 : 0.22);

    // Faint diagonal lines on the right, fading in from the middle of the card.
    const lines = ctx.createLinearGradient(CARD_WIDTH * 0.4, 0, CARD_WIDTH, 0);
    lines.addColorStop(0, 'rgba(255, 255, 255, 0)');
    lines.addColorStop(1, THEME.faint);
    ctx.strokeStyle = lines;
    ctx.lineWidth = 2;
    for (let offset = CARD_WIDTH * 0.4; offset < CARD_WIDTH + CARD_HEIGHT; offset += 26) {
        ctx.beginPath();
        ctx.moveTo(offset, 0);
        ctx.lineTo(offset - CARD_HEIGHT, CARD_HEIGHT);
        ctx.stroke();
    }
}

function drawBorder(ctx) {
    ctx.restore();
    roundRect(ctx, 1, 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, CARD_RADIUS - 1);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 2;
    ctx.stroke();
}

// Little sparkles around the avatar on the level-up card. Fixed spots, so
// every card is the same apart from its text and avatar.
const SPARKLES = [
    [30, 52, 5, 0], [262, 40, 4, 1], [282, 236, 6, 0], [36, 256, 4, 1],
    [266, 150, 3, 1], [22, 150, 3, 0], [330, 70, 3, 1], [210, 278, 3, 0],
];

function drawSparkles(ctx) {
    for (const [x, y, size, tone] of SPARKLES) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = tone ? THEME.accentEnd : THEME.accent;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(-size, -size, size * 2, size * 2);
        ctx.restore();
    }
}

function drawAvatar(ctx, image) {
    const { x, y } = avatarCenter();
    const radius = AVATAR_DIAMETER / 2;

    // Gradient ring with a thin gap between it and the picture.
    ctx.save();
    ctx.shadowColor = 'rgba(91, 140, 255, 0.55)';
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(x, y, radius + 9, 0, Math.PI * 2);
    ctx.fillStyle = accentGradient(ctx, x - radius, y - radius, x + radius, y + radius);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = THEME.backgroundBottom;
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

// A level bubble on the avatar's lower right, like a badge.
function drawLevelBadge(ctx, stack, level) {
    const { x, y } = avatarCenter();
    const offset = (AVATAR_DIAMETER / 2) * 0.72;
    const cx = x + offset;
    const cy = y + offset;
    ctx.font = font(stack, 26, 800);
    const label = number(level);
    const r = Math.max(30, (ctx.measureText(label).width / 2) + 14);
    ctx.beginPath();
    ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = THEME.backgroundBottom;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = accentGradient(ctx, cx - r, cy - r, cx + r, cy + r);
    ctx.fill();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy + 1);
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
    ctx.save();
    ctx.shadowColor = 'rgba(200, 107, 255, 0.55)';
    ctx.shadowBlur = 18;
    roundRect(ctx, left, y, Math.min(width, Math.max(fill, height)), height, height / 2);
    ctx.fillStyle = accentGradient(ctx, left, y, right, y);
    ctx.fill();
    ctx.restore();
    // A soft highlight along the top of the fill.
    roundRect(ctx, left + 4, y + 3, Math.max(0, Math.min(width, Math.max(fill, height)) - 8), Math.max(2, height * 0.28), height * 0.14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
}

// Small caps label over a value, right-aligned at `right`. Returns its width.
function drawStat(ctx, stack, { label, value, right, gradient = false }) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 46, 800);
    const valueWidth = ctx.measureText(value).width;
    ctx.font = font(stack, 16, 700);
    setSpacing(ctx, 3);
    const labelWidth = ctx.measureText(label).width;
    ctx.fillStyle = THEME.muted;
    ctx.fillText(label, right, 54);
    setSpacing(ctx, 0);
    ctx.font = font(stack, 46, 800);
    ctx.fillStyle = gradient ? accentGradient(ctx, right - valueWidth, 60, right, 100) : THEME.text;
    ctx.fillText(value, right, 102);
    return Math.max(valueWidth, labelWidth);
}

// A rounded pill: a small caps label then a role name with a color dot.
function drawChip(ctx, stack, { label, name, color, right, y, maxWidth }) {
    const height = 44;
    const padding = 18;
    ctx.font = font(stack, 14, 700);
    setSpacing(ctx, 2);
    const labelWidth = ctx.measureText(label).width;
    setSpacing(ctx, 0);
    ctx.font = font(stack, 20, 600);
    const room = maxWidth - labelWidth - (padding * 2) - 32;
    const shown = fitText(ctx, name, Math.max(40, room));
    const nameWidth = ctx.measureText(shown).width;
    const width = padding + labelWidth + 14 + 12 + 8 + nameWidth + padding;
    const left = right - width;

    roundRect(ctx, left, y, width, height, height / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = swatch(color);
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let x = left + padding;
    ctx.font = font(stack, 14, 700);
    setSpacing(ctx, 2);
    ctx.fillStyle = THEME.muted;
    ctx.fillText(label, x, y + (height / 2) + 1);
    setSpacing(ctx, 0);
    x += labelWidth + 14;
    ctx.beginPath();
    ctx.arc(x + 6, y + (height / 2), 6, 0, Math.PI * 2);
    ctx.fillStyle = swatch(color);
    ctx.fill();
    x += 12 + 8;
    ctx.font = font(stack, 20, 600);
    ctx.fillStyle = THEME.text;
    ctx.fillText(shown, x, y + (height / 2) + 1);
    return width;
}

// ---------------------------------------------------------------- cards

function paintRank(ctx, stack, spec) {
    const level = whole(spec.level);
    const rank = whole(spec.rank);
    const current = whole(spec.current);
    const needed = whole(spec.needed);

    // Stats, right to left: level, then rank.
    let right = TEXT_RIGHT;
    right -= drawStat(ctx, stack, { label: 'LEVEL', value: number(level), right, gradient: true }) + 40;
    right -= drawStat(ctx, stack, { label: 'RANK', value: rank > 0 ? `#${number(rank)}` : '—', right }) + 36;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 44, 700);
    ctx.fillStyle = THEME.text;
    ctx.fillText(fitText(ctx, spec.displayName, right - TEXT_LEFT), TEXT_LEFT, 100);

    // Progress row: what it is on the left, the numbers on the right.
    ctx.font = font(stack, 20, 600);
    ctx.fillStyle = THEME.muted;
    ctx.fillText(`Progress to Level ${number(level + 1)}`, TEXT_LEFT, 176);
    ctx.textAlign = 'right';
    ctx.font = font(stack, 20, 500);
    const goal = needed > 0 ? ` / ${number(needed)} XP` : ' XP';
    ctx.fillStyle = THEME.muted;
    ctx.fillText(goal, TEXT_RIGHT, 176);
    const goalWidth = ctx.measureText(goal).width;
    ctx.font = font(stack, 20, 700);
    ctx.fillStyle = THEME.text;
    ctx.fillText(number(current), TEXT_RIGHT - goalWidth, 176);

    drawProgress(ctx, { left: TEXT_LEFT, right: TEXT_RIGHT, y: 192, height: 30, current, needed });

    // Under the bar: the next level role, and how much XP is left.
    ctx.textBaseline = 'alphabetic';
    const left = needed > current ? `${number(needed - current)} XP to go` : '';
    ctx.textAlign = 'right';
    ctx.font = font(stack, 18, 500);
    ctx.fillStyle = THEME.muted;
    if (left) ctx.fillText(left, TEXT_RIGHT, 258);
    const leftWidth = left ? ctx.measureText(left).width + 24 : 0;
    const next = spec.next && spec.next.name ? spec.next : null;
    ctx.textAlign = 'left';
    if (next) {
        ctx.beginPath();
        ctx.arc(TEXT_LEFT + 6, 252, 6, 0, Math.PI * 2);
        ctx.fillStyle = swatch(next.color);
        ctx.fill();
        ctx.fillStyle = THEME.muted;
        ctx.font = font(stack, 18, 500);
        const text = `Next role: ${next.name} at Level ${number(next.level)}`;
        ctx.fillText(fitText(ctx, text, TEXT_RIGHT - TEXT_LEFT - 20 - leftWidth), TEXT_LEFT + 20, 258);
    } else if (spec.totalXp != null) {
        ctx.fillStyle = THEME.muted;
        ctx.font = font(stack, 18, 500);
        ctx.fillText(`${number(spec.totalXp)} XP total`, TEXT_LEFT, 258);
    }
}

function paintLevelUp(ctx, stack, spec) {
    const from = whole(spec.from);
    const to = whole(spec.to);
    const current = whole(spec.current);
    const needed = whole(spec.needed);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(stack, 22, 800);
    setSpacing(ctx, 5);
    const heading = 'LEVEL UP!';
    ctx.fillStyle = accentGradient(ctx, TEXT_LEFT, 40, TEXT_LEFT + ctx.measureText(heading).width, 70);
    ctx.fillText(heading, TEXT_LEFT, 64);
    setSpacing(ctx, 0);

    ctx.font = font(stack, 40, 700);
    ctx.fillStyle = THEME.text;
    ctx.fillText(fitText(ctx, spec.displayName, TEXT_RIGHT - TEXT_LEFT), TEXT_LEFT, 114);

    // The jump: old level, arrow, new level.
    const baseline = 204;
    let x = TEXT_LEFT;
    ctx.font = font(stack, 30, 700);
    ctx.fillStyle = THEME.muted;
    ctx.fillText('LV', x, baseline);
    x += ctx.measureText('LV').width + 12;
    ctx.font = font(stack, 56, 700);
    ctx.fillText(number(from), x, baseline);
    x += ctx.measureText(number(from)).width + 18;
    ctx.font = font(stack, 44, 600);
    ctx.fillText('→', x, baseline - 6);
    x += ctx.measureText('→').width + 18;
    ctx.font = font(stack, 84, 800);
    const toText = number(to);
    const toWidth = ctx.measureText(toText).width;
    ctx.save();
    ctx.shadowColor = 'rgba(200, 107, 255, 0.6)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = accentGradient(ctx, x, baseline - 70, x + toWidth, baseline);
    ctx.fillText(toText, x, baseline);
    ctx.restore();
    x += toWidth;

    // Roles earned on this level-up, or else the next one to aim for.
    const rewards = Array.isArray(spec.rewards) ? spec.rewards.filter((reward) => reward && reward.name) : [];
    const chipRoom = TEXT_RIGHT - x - 32;
    if (chipRoom > 160) {
        if (rewards.length) {
            const name = rewards.length === 1 ? rewards[0].name : `${rewards[rewards.length - 1].name} +${rewards.length - 1}`;
            drawChip(ctx, stack, { label: rewards.length === 1 ? 'NEW ROLE' : 'NEW ROLES', name, color: rewards[rewards.length - 1].color, right: TEXT_RIGHT, y: baseline - 52, maxWidth: chipRoom });
        } else if (spec.next && spec.next.name) {
            drawChip(ctx, stack, { label: `NEXT · LV ${number(spec.next.level)}`, name: spec.next.name, color: spec.next.color, right: TEXT_RIGHT, y: baseline - 52, maxWidth: chipRoom });
        }
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.font = font(stack, 17, 500);
    ctx.fillStyle = THEME.muted;
    const caption = needed > 0
        ? `${number(current)} / ${number(needed)} XP to Level ${number(to + 1)}`
        : `${number(current)} XP`;
    ctx.fillText(caption, TEXT_RIGHT, 240);
    drawProgress(ctx, { left: TEXT_LEFT, right: TEXT_RIGHT, y: 252, height: 14, current, needed });
}

function paint(canvasLib, image, spec, painter, options) {
    const canvas = canvasLib.createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const stack = ensureFont(canvasLib.GlobalFonts);
    drawBackground(ctx, options);
    if (options.celebrate) drawSparkles(ctx);
    drawAvatar(ctx, image);
    if (options.badge != null) drawLevelBadge(ctx, stack, options.badge);
    painter(ctx, stack, spec);
    drawBorder(ctx);
    return canvas.toBuffer('image/png');
}

async function renderRankCard(input = {}) {
    const canvasLib = loadCanvas();
    const image = await resolveAvatar(canvasLib, input);
    return paint(canvasLib, image, input, paintRank, {});
}

async function renderLevelUpCard(input = {}) {
    const canvasLib = loadCanvas();
    const image = await resolveAvatar(canvasLib, input);
    return paint(canvasLib, image, input, paintLevelUp, { celebrate: true, badge: whole(input.to) });
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
