// Reads RSS 2.0 and Atom feeds: WordPress, Ghost, Substack, Blogger, Medium,
// and most other blogs publish one. No XML library: feeds are small, and the
// few elements Blog Watcher uses are pulled out with bounded patterns.
const dns = require('node:dns/promises');
const net = require('node:net');

const FETCH_TIMEOUT_MS = 10000;
const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const MAX_ITEMS = 50;
const USER_AGENT = 'Mika Discord bot (Blog Watcher)';
const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, text/html;q=0.5, */*;q=0.1';
// Tried after the given address when it is a blog's home page without a feed link.
const FEED_PATHS = ['/feed/', '/rss/', '/feed.xml', '/atom.xml', '/index.xml', '/rss.xml'];

class FeedError extends Error {
    constructor(message, reason) {
        super(message);
        this.name = 'FeedError';
        this.reason = reason;
    }
}

// ---------------------------------------------------------------- text

const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
    lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®',
    trade: '™', bull: '•', middot: '·', deg: '°', times: '×', eacute: 'é', egrave: 'è', aacute: 'á',
    iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç',
};

function decodeEntities(text) {
    return String(text == null ? '' : text).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, code) => {
        if (code[0] === '#') {
            const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return match;
            return String.fromCodePoint(point);
        }
        const named = NAMED[code.toLowerCase()];
        return named == null ? match : named;
    });
}

function unwrapCdata(text) {
    return String(text == null ? '' : text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

// The decoded text of an element that holds plain text (a title, a name).
function textOf(raw) {
    const inner = String(raw == null ? '' : raw);
    // CDATA keeps markup literal; anything outside it is XML-escaped.
    const parts = inner.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g);
    return parts.map((part) => (part.startsWith('<![CDATA[') ? unwrapCdata(part) : decodeEntities(part.replace(/<[^>]*>/g, '')))).join('').trim();
}

// The HTML an element holds, whether it was escaped or wrapped in CDATA.
function htmlOf(raw) {
    const inner = String(raw == null ? '' : raw);
    const parts = inner.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/g);
    return parts.map((part) => (part.startsWith('<![CDATA[') ? unwrapCdata(part) : decodeEntities(part))).join('').trim();
}

function escapeName(name) {
    return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Every <name ...>inner</name> (or <name .../>) in a block.
function elements(block, name) {
    const tagName = escapeName(name);
    const pattern = new RegExp(`<${tagName}(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${tagName}\\s*>)`, 'gi');
    const found = [];
    let match;
    while ((match = pattern.exec(block)) && found.length < 200) {
        found.push({ attrs: match[1] || '', inner: match[2] || '' });
    }
    return found;
}

function element(block, name) {
    return elements(block, name)[0] || null;
}

function attr(attrs, name) {
    const match = new RegExp(`\\s${escapeName(name)}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(` ${attrs || ''}`);
    return match ? decodeEntities(match[2] != null ? match[2] : match[3]).trim() : '';
}

function absoluteUrl(value, base) {
    if (!value) return '';
    try {
        const url = new URL(value, base || undefined);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch (error) {
        return '';
    }
}

function dateOf(text) {
    if (!text) return null;
    const date = new Date(String(text).trim());
    return Number.isFinite(date.getTime()) ? date : null;
}

// The first picture in a post's HTML, skipping tracking pixels and emoji.
function firstImage(html, base) {
    const pattern = /<img\b([^>]*)>/gi;
    let match;
    while ((match = pattern.exec(html || ''))) {
        const attrs = match[1];
        const src = absoluteUrl(attr(attrs, 'src') || attr(attrs, 'data-src'), base);
        if (!src || /\.svg(\?|$)/i.test(src) || /emoji|gravatar|pixel|feeds\.feedburner/i.test(src)) continue;
        const width = Number(attr(attrs, 'width'));
        if (Number.isFinite(width) && width > 0 && width < 100) continue;
        return src;
    }
    return '';
}

function mediaImage(block, base) {
    for (const name of ['media:content', 'media:thumbnail', 'enclosure']) {
        for (const found of elements(block, name)) {
            const type = attr(found.attrs, 'type');
            const medium = attr(found.attrs, 'medium');
            if (name !== 'media:thumbnail' && type && !type.startsWith('image/') && medium !== 'image') continue;
            // MyAnimeList puts the address inside the tag: <media:thumbnail>https://...</media:thumbnail>.
            const url = absoluteUrl(attr(found.attrs, 'url') || (name === 'media:thumbnail' ? textOf(found.inner) : ''), base);
            if (url) return url;
        }
    }
    return '';
}

// WordPress serves sized copies such as icon-32x32.jpg. The full image is the same name without the size.
function fullSizeImage(url) {
    return url ? url.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|gif|webp)(?:\?|$))/i, '') : '';
}

// ---------------------------------------------------------------- parsing

function parseRss(xml) {
    const channelEnd = xml.search(/<item[\s>]/i);
    const head = channelEnd === -1 ? xml : xml.slice(0, channelEnd);
    const link = absoluteUrl(textOf(element(head, 'link')?.inner));
    const image = element(head, 'image');
    const items = elements(xml, 'item').slice(0, MAX_ITEMS).map(({ inner }) => {
        const itemLink = absoluteUrl(textOf(element(inner, 'link')?.inner), link);
        const guid = textOf(element(inner, 'guid')?.inner);
        const content = htmlOf(element(inner, 'content:encoded')?.inner);
        const description = htmlOf(element(inner, 'description')?.inner);
        const html = content || description;
        return {
            id: guid || itemLink,
            title: textOf(element(inner, 'title')?.inner),
            link: itemLink,
            author: textOf(element(inner, 'dc:creator')?.inner) || textOf(element(inner, 'author')?.inner),
            published: dateOf(textOf(element(inner, 'pubDate')?.inner) || textOf(element(inner, 'dc:date')?.inner)),
            categories: [...new Set(elements(inner, 'category').map((entry) => textOf(entry.inner)).filter(Boolean))],
            html,
            summary: description,
            image: mediaImage(inner, itemLink) || firstImage(html, itemLink),
        };
    });
    return {
        title: textOf(element(head, 'title')?.inner),
        link,
        description: textOf(element(head, 'description')?.inner),
        icon: absoluteUrl(textOf(image && element(image.inner, 'url')?.inner), link),
        items,
    };
}

function atomLink(block, base) {
    const links = elements(block, 'link');
    const alternate = links.find((entry) => !attr(entry.attrs, 'rel') || attr(entry.attrs, 'rel') === 'alternate');
    return absoluteUrl(attr((alternate || links[0] || {}).attrs, 'href'), base);
}

function parseAtom(xml) {
    const firstEntry = xml.search(/<entry[\s>]/i);
    const head = firstEntry === -1 ? xml : xml.slice(0, firstEntry);
    const link = atomLink(head);
    const feedAuthor = textOf(element(element(head, 'author')?.inner || '', 'name')?.inner);
    const items = elements(xml, 'entry').slice(0, MAX_ITEMS).map(({ inner }) => {
        const entryLink = atomLink(inner, link);
        const content = htmlOf(element(inner, 'content')?.inner);
        const summary = htmlOf(element(inner, 'summary')?.inner);
        const html = content || summary;
        return {
            id: textOf(element(inner, 'id')?.inner) || entryLink,
            title: textOf(element(inner, 'title')?.inner),
            link: entryLink,
            author: textOf(element(element(inner, 'author')?.inner || '', 'name')?.inner) || feedAuthor,
            published: dateOf(textOf(element(inner, 'published')?.inner) || textOf(element(inner, 'updated')?.inner)),
            categories: [...new Set(elements(inner, 'category').map((entry) => attr(entry.attrs, 'label') || attr(entry.attrs, 'term')).filter(Boolean))],
            html,
            summary,
            image: mediaImage(inner, entryLink) || firstImage(html, entryLink),
        };
    });
    return {
        title: textOf(element(head, 'title')?.inner),
        link,
        description: textOf(element(head, 'subtitle')?.inner),
        icon: absoluteUrl(textOf(element(head, 'icon')?.inner) || textOf(element(head, 'logo')?.inner), link),
        items,
    };
}

function looksLikeFeed(text) {
    const start = String(text || '').slice(0, 2000);
    return /<rss[\s>]/i.test(start) || /<feed[\s>]/i.test(start) || /<rdf:RDF[\s>]/i.test(start);
}

// Newest first, the order every major blog platform already uses.
function parseFeed(text) {
    const xml = String(text || '').replace(/<!--[\s\S]*?-->/g, '');
    if (!looksLikeFeed(xml)) throw new FeedError('That address is not an RSS or Atom feed.', 'not-feed');
    const feed = /<feed[\s>]/i.test(xml.slice(0, 2000)) ? parseAtom(xml) : parseRss(xml);
    feed.items = feed.items.filter((item) => item.id && item.link);
    feed.items.sort((a, b) => (b.published?.getTime() || 0) - (a.published?.getTime() || 0));
    if (!feed.title) {
        try { feed.title = new URL(feed.link).hostname; } catch (error) { feed.title = 'Blog'; }
    }
    feed.icon = fullSizeImage(feed.icon);
    return feed;
}

// <link rel="alternate" type="application/rss+xml" href="..."> on a blog's home page.
function discoverFeedLinks(html, base) {
    const found = [];
    const pattern = /<link\b([^>]*)>/gi;
    let match;
    while ((match = pattern.exec(String(html || '').slice(0, 300000)))) {
        const attrs = match[1];
        if (!/alternate/i.test(attr(attrs, 'rel'))) continue;
        if (!/application\/(rss|atom)\+xml/i.test(attr(attrs, 'type'))) continue;
        // WordPress also lists each post's comment feed. The site feed comes first.
        if (/comments/i.test(attr(attrs, 'href')) || /comments/i.test(attr(attrs, 'title'))) continue;
        const url = absoluteUrl(attr(attrs, 'href'), base);
        if (url && !found.includes(url)) found.push(url);
    }
    return found;
}

// ---------------------------------------------------------------- fetching

function isPrivateAddress(address) {
    if (net.isIPv4(address)) {
        const [a, b] = address.split('.').map(Number);
        return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
    }
    if (net.isIPv6(address)) {
        const lower = address.toLowerCase();
        const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
        if (mapped) return isPrivateAddress(mapped[1]);
        return lower === '::' || lower === '::1' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || /^ff/.test(lower);
    }
    return true;
}

// Feeds come from anywhere on the public internet, never the bot's own network.
async function assertPublicUrl(value, { lookup = dns.lookup } = {}) {
    let url;
    try {
        url = new URL(value);
    } catch (error) {
        throw new FeedError('That is not a web address.', 'invalid');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FeedError('Use an http:// or https:// address.', 'invalid');
    if (url.username || url.password) throw new FeedError('Use an address without a username or password.', 'invalid');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new FeedError('Use a public web address.', 'private');
    }
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) throw new FeedError('Use a public web address.', 'private');
        return url;
    }
    let addresses;
    try {
        addresses = await lookup(host, { all: true, verbatim: true });
    } catch (error) {
        throw new FeedError(`I couldn't find ${host}. Check the address.`, 'dns');
    }
    const list = Array.isArray(addresses) ? addresses : [addresses];
    if (!list.length || list.some((entry) => isPrivateAddress(entry && entry.address))) {
        throw new FeedError('Use a public web address.', 'private');
    }
    return url;
}

async function readText(response, maxBytes = MAX_FEED_BYTES) {
    const length = Number(response.headers?.get?.('content-length'));
    if (length > maxBytes) {
        await response.body?.cancel?.();
        throw new FeedError('That feed is too large.', 'size');
    }
    if (!response.body?.getReader) return response.text();
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new FeedError('That feed is too large.', 'size');
            chunks.push(Buffer.from(value));
        }
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
    return Buffer.concat(chunks).toString('utf8');
}

// One GET with conditional headers. Redirects are followed by hand so each hop is checked.
async function fetchFeed(address, { etag = '', lastModified = '', fetchImpl = globalThis.fetch, lookup, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
    let current = address;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        await assertPublicUrl(current, { lookup });
        const headers = { 'user-agent': USER_AGENT, accept: ACCEPT };
        if (etag) headers['if-none-match'] = etag;
        if (lastModified) headers['if-modified-since'] = lastModified;
        let response;
        try {
            response = await fetchImpl(current, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        } catch (error) {
            const reason = error && (error.name === 'TimeoutError' || error.name === 'AbortError') ? 'timeout' : 'network';
            throw new FeedError(reason === 'timeout' ? 'The blog took too long to answer.' : 'I couldn\'t reach that blog.', reason);
        }
        if (response.status >= 300 && response.status < 400 && response.status !== 304) {
            const next = response.headers.get('location');
            await response.body?.cancel?.();
            if (!next) throw new FeedError('The blog sent a broken redirect.', 'redirect');
            current = new URL(next, current).href;
            continue;
        }
        if (response.status === 304) {
            await response.body?.cancel?.();
            return { notModified: true, url: current, etag, lastModified };
        }
        if (!response.ok) {
            await response.body?.cancel?.();
            throw new FeedError(`The blog answered with error ${response.status}.`, 'status');
        }
        const body = await readText(response);
        return {
            notModified: false,
            url: current,
            body,
            contentType: response.headers.get('content-type') || '',
            etag: response.headers.get('etag') || '',
            lastModified: response.headers.get('last-modified') || '',
        };
    }
    throw new FeedError('The blog redirected too many times.', 'redirect');
}

// What someone typed (renos.world, a home page, or a feed) to the feed's address.
async function resolveFeedUrl(input, options = {}) {
    let text = String(input || '').trim();
    if (!text) throw new FeedError('Type a blog address or its feed URL.', 'invalid');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
    const tried = new Set();
    const attempt = async (address) => {
        if (tried.has(address)) return null;
        tried.add(address);
        const result = await fetchFeed(address, options);
        return { ...result, parsed: looksLikeFeed(result.body) ? parseFeed(result.body) : null };
    };

    let first;
    try {
        first = await attempt(text);
    } catch (error) {
        if (error.reason === 'invalid' || error.reason === 'private' || error.reason === 'dns') throw error;
        first = null;
    }
    if (first && first.parsed) return { url: first.url, feed: first.parsed };

    const base = first ? first.url : text;
    const candidates = first ? discoverFeedLinks(first.body, base) : [];
    const origin = new URL(base).origin;
    for (const path of FEED_PATHS) candidates.push(`${origin}${path}`);
    for (const candidate of candidates) {
        try {
            const found = await attempt(candidate);
            if (found && found.parsed) return { url: found.url, feed: found.parsed };
        } catch (error) {
            if (error.reason === 'private') throw error;
        }
    }
    throw new FeedError('I couldn\'t find an RSS or Atom feed there. Try the feed URL itself, such as https://example.com/feed/.', 'not-feed');
}

module.exports = {
    FeedError,
    FEED_PATHS,
    MAX_FEED_BYTES,
    decodeEntities,
    textOf,
    htmlOf,
    firstImage,
    fullSizeImage,
    parseFeed,
    discoverFeedLinks,
    isPrivateAddress,
    assertPublicUrl,
    fetchFeed,
    resolveFeedUrl,
};
