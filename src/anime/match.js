function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    if (Math.abs(a.length - b.length) > 2) return 3;
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let prev = i - 1;
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const temp = row[j];
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
            prev = temp;
        }
    }
    return row[b.length];
}

function namesOf(media) {
    const titles = media && media.titles ? media.titles : {};
    return [titles.romaji, titles.english, titles.native, ...((media && media.synonyms) || [])];
}

function kindAgainst(query, name) {
    const left = normalizeTitle(query);
    const right = normalizeTitle(name);
    if (!left || !right) return null;
    if (left === right) return 'exact';
    if (Math.abs(left.length - right.length) > 2) return null;
    const limit = left.length < 5 ? 0 : (left.length < 8 ? 1 : 2);
    if (!limit) return null;
    return levenshtein(left, right) <= limit ? 'near' : null;
}

function matchKind(query, media) {
    let near = false;
    for (const name of namesOf(media)) {
        const kind = kindAgainst(query, name);
        if (kind === 'exact') return 'exact';
        if (kind === 'near') near = true;
    }
    return near ? 'near' : null;
}

// One exact title, or one near title when nothing is exact, opens the full
// embed. Anything ambiguous stays a menu.
function pickTitle(query, results) {
    const exact = [];
    const near = [];
    for (const result of results || []) {
        const kind = matchKind(query, result);
        if (kind === 'exact') exact.push(result);
        else if (kind === 'near') near.push(result);
    }
    if (exact.length === 1) return exact[0];
    if (exact.length === 0 && near.length === 1) return near[0];
    return null;
}

module.exports = {
    normalizeTitle,
    levenshtein,
    matchKind,
    pickTitle,
};
