// Small rank and level-up cards. @napi-rs/canvas is required only when a card
// is drawn, so a missing binary does not stop the bot from booting.
const CARD_WIDTH = 800;
const CARD_HEIGHT = 200;
const AVATAR_DIAMETER = 132;
const AVATAR_MARGIN = 24;
const AVATAR_BYTES = 256 * 1024;

const BACKGROUND = '#161c2c';
const ACCENT = '#4c8dff';
const TEXT = '#f7f8fb';
const MUTED = '#c5d0e0';
const TRACK = '#2a3348';

const FONT_FAMILIES = ['DejaVu Sans', 'Liberation Sans', 'Noto Sans'];
const FONT_FILES = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
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

function levelUpLabel(from, to) {
    return `${whole(from)} → ${whole(to)}`;
}

function avatarCenter() {
    return {
        x: CARD_WIDTH - AVATAR_MARGIN - (AVATAR_DIAMETER / 2),
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
    for (const family of FONT_FAMILIES) {
        try {
            if (GlobalFonts.has(family)) families.push(`"${family}"`);
        } catch (error) {
            // Font lookup can fail when the process has no font config.
        }
    }
    if (!families.length) {
        for (const file of FONT_FILES) {
            try {
                if (GlobalFonts.registerFromPath(file, 'Mika Sans')) {
                    families.push('"Mika Sans"');
                    break;
                }
            } catch (error) {
                // That font file is not installed here.
            }
        }
    }
    families.push('sans-serif');
    fontStack = families.join(', ');
    return fontStack;
}

function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
    const value = String(text || 'Unknown user');
    if (ctx.measureText(value).width <= maxWidth) return value;
    let trimmed = value;
    while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
        trimmed = trimmed.slice(0, -1);
    }
    return `${trimmed}…`;
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

function drawAvatar(ctx, image) {
    const { x, y } = avatarCenter();
    const radius = AVATAR_DIAMETER / 2;
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

    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 4;
    ctx.stroke();
}

function drawProgress(ctx, left, width, current, needed) {
    const y = 124;
    const height = 18;
    roundRect(ctx, left, y, width, height, 9);
    ctx.fillStyle = TRACK;
    ctx.fill();
    const goal = whole(needed);
    const ratio = goal > 0 ? Math.min(1, whole(current) / goal) : 0;
    const fill = Math.round(width * ratio);
    if (fill > 0) {
        roundRect(ctx, left, y, Math.min(width, Math.max(fill, 8)), height, 9);
        ctx.fillStyle = ACCENT;
        ctx.fill();
    }
}

function paint(canvasLib, image, spec) {
    const canvas = canvasLib.createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const stack = ensureFont(canvasLib.GlobalFonts);
    const left = 36;
    const { x } = avatarCenter();
    const textWidth = x - (AVATAR_DIAMETER / 2) - 28 - left;

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, 8, CARD_HEIGHT);
    drawAvatar(ctx, image);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT;
    ctx.font = `28px ${stack}`;
    ctx.fillText(fitText(ctx, spec.displayName, textWidth), left, 42);

    ctx.font = `32px ${stack}`;
    ctx.fillText(fitText(ctx, spec.middle, textWidth), left, 90);

    drawProgress(ctx, left, textWidth, spec.current, spec.needed);
    ctx.font = `16px ${stack}`;
    ctx.fillStyle = MUTED;
    const goal = whole(spec.needed);
    const caption = goal > 0
        ? `${whole(spec.current).toLocaleString('en-US')} / ${goal.toLocaleString('en-US')} XP`
        : `${whole(spec.current).toLocaleString('en-US')} XP`;
    ctx.fillText(caption, left, 166);

    return canvas.toBuffer('image/png');
}

async function render(spec) {
    const canvasLib = loadCanvas();
    const image = await resolveAvatar(canvasLib, spec);
    return paint(canvasLib, image, spec);
}

function renderRankCard(input) {
    const level = whole(input && input.level);
    const rank = whole(input && input.rank);
    const middle = rank > 0 ? `Level ${level}    Rank #${rank}` : `Level ${level}`;
    return render({
        ...input,
        displayName: input && input.displayName,
        middle,
        current: input && input.current,
        needed: input && input.needed,
    });
}

function renderLevelUpCard(input) {
    return render({
        ...input,
        displayName: input && input.displayName,
        middle: levelUpLabel(input && input.from, input && input.to),
        current: input && input.current,
        needed: input && input.needed,
    });
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
