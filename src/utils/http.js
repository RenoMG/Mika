const MAX_BODY_BYTES = 2 * 1024 * 1024;

function aborted() {
    return Object.assign(new Error('Request aborted'), { name: 'AbortError' });
}

async function withSignal(promise, signal) {
    if (!signal) return promise;
    if (signal.aborted) { Promise.resolve(promise).catch(() => {}); throw aborted(); }
    let listener;
    const abort = new Promise((_, reject) => {
        listener = () => reject(aborted());
        signal.addEventListener('abort', listener, { once: true });
    });
    try { return await Promise.race([promise, abort]); }
    finally { signal.removeEventListener('abort', listener); }
}

async function readJson(response, signal, maxBytes = MAX_BODY_BYTES) {
    const length = Number(response.headers?.get?.('content-length'));
    if (length > maxBytes) {
        await response.body?.cancel?.();
        throw new Error('Provider response exceeds size limit');
    }
    if (!response.body?.getReader) return withSignal(response.json(), signal);
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    try {
        for (;;) {
            const { done, value } = await withSignal(reader.read(), signal);
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error('Provider response exceeds size limit');
            chunks.push(Buffer.from(value));
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
    }
}
module.exports = { readJson, withSignal };
