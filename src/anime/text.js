const { WORDS, PHRASES } = require('./slurs');

const BLOCKED = "That text isn't allowed.";
const BIO_MAX = 200;

const LEET = {
    0: 'o',
    1: 'i',
    3: 'e',
    4: 'a',
    5: 's',
    7: 't',
    '@': 'a',
    $: 's',
};

// Letters that look like Latin letters in another script. Folded only for the
// slur check, so a title is never rewritten for display.
const CONFUSABLES = {
    '\u0430': 'a',
    '\u0435': 'e',
    '\u043e': 'o',
    '\u0440': 'p',
    '\u0441': 'c',
    '\u0443': 'y',
    '\u0445': 'x',
    '\u0456': 'i',
    '\u0455': 's',
    '\u04bb': 'h',
    '\u0501': 'd',
    '\u0261': 'g',
};

function fold(ch) {
    if (LEET[ch]) return LEET[ch];
    const lower = ch.toLowerCase();
    if (LEET[lower]) return LEET[lower];
    if (CONFUSABLES[ch]) return CONFUSABLES[ch];
    if (CONFUSABLES[lower]) return CONFUSABLES[lower];
    return lower;
}

function lettersOnly(token) {
    let out = '';
    const source = String(token || '').normalize('NFKC');
    for (const ch of source) {
        const folded = fold(ch);
        if (folded.length === 1 && folded >= 'a' && folded <= 'z') out += folded;
    }
    return out;
}

function collapse(text, minRun, keep) {
    return text.replace(/(.)\1+/g, (run, ch) => (run.length >= minRun ? ch.repeat(keep) : run));
}

function forms(letters) {
    if (!letters) return [];
    const mild = collapse(letters, 3, 2);
    const hard = collapse(letters, 3, 1);
    return mild === hard ? [mild] : [mild, hard];
}

function listed(letters) {
    return forms(letters).some((form) => WORDS.has(form));
}

function containsSlur(input) {
    if (typeof input !== 'string' || !input) return false;
    const cleaned = input.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, ' ');
    const parts = cleaned.split(/\s+/).map(lettersOnly).filter(Boolean);

    for (const part of parts) {
        if (listed(part)) return true;
    }

    for (let start = 0; start < parts.length; start += 1) {
        let joined = '';
        for (let index = start; index < parts.length && index < start + 8; index += 1) {
            if (parts[index].length > 8) break;
            joined += parts[index];
            if (joined.length > 24) break;
            if (index === start) continue;
            const shortest = parts.slice(start, index + 1).reduce((min, part) => Math.min(min, part.length), 99);
            // Only glue fragmented tokens. Two ordinary words stay apart, which
            // keeps place names that merely contain a slur from matching.
            if (shortest <= 3 && listed(joined)) return true;
        }
    }

    for (let index = 0; index < parts.length - 1; index += 1) {
        const phrase = `${collapse(parts[index], 3, 2)} ${collapse(parts[index + 1], 3, 2)}`;
        if (PHRASES.has(phrase)) return true;
    }
    return false;
}

function neutralize(value, max = 256) {
    let text = String(value == null ? '' : value);
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');
    for (let pass = 0; pass < 4; pass += 1) {
        const next = text.replace(/@(everyone|here)/gi, '$1');
        if (next === text) break;
        text = next;
    }
    text = text
        .replace(/<@!?\d{17,20}>/g, 'user')
        .replace(/<@&\d{17,20}>/g, 'role')
        .replace(/<#\d{17,20}>/g, 'channel')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/discord\.gg\/\S+/gi, '')
        .replace(/[*_~`|]+/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (text.length > max) text = text.slice(0, max).trim();
    return text;
}

function sanitizeUserText(input, max) {
    if (typeof input !== 'string') return { error: 'Send some text.' };
    if (containsSlur(input)) return { error: BLOCKED };

    let text = input.normalize('NFKC').replace(/[\u0000\u200B-\u200D\uFEFF]/g, '');
    for (let pass = 0; pass < 4; pass += 1) {
        const next = text.replace(/@(everyone|here)/gi, '$1');
        if (next === text) break;
        text = next;
    }
    text = text
        .replace(/<@!?\d{17,20}>/g, 'user')
        .replace(/<@&\d{17,20}>/g, 'role')
        .replace(/<#\d{17,20}>/g, 'channel')
        .replace(/https?:\/\/\S+/gi, '')
        .replace(/discord\.gg\/\S+/gi, '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[*_~`|]+/g, '')
        .replace(/\r/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[^\S\n]{2,}/g, ' ')
        .trim();

    if (containsSlur(text)) return { error: BLOCKED };
    if (!text) return { error: 'Send some text.' };
    if (text.length > max) return { error: `Keep it under ${max} characters.` };
    return { text };
}

module.exports = {
    BLOCKED,
    BIO_MAX,
    lettersOnly,
    containsSlur,
    neutralize,
    sanitizeUserText,
};
