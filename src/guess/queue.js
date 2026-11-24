// Process-wide admission control. Waiting work is bounded and deduplicated by
// server; tasks never escape the concurrency limit, even when one is slow.
function createWorkQueue({ concurrency = 4, maxPending = 1000, spacingMs = 200,
    now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onError = () => {} } = {}) {
    const pending = new Map();
    const running = new Set();
    let timer = null;
    let nextAt = 0;
    function pump() {
        if (timer || running.size >= concurrency || !pending.size) return;
        const wait = nextAt - now();
        if (wait > 0) {
            timer = setTimer(() => { timer = null; pump(); }, wait);
            timer?.unref?.();
            return;
        }
        const [key, task] = pending.entries().next().value;
        pending.delete(key);
        running.add(key);
        nextAt = now() + spacingMs;
        Promise.resolve().then(task).catch(onError).finally(() => {
            running.delete(key);
            pump();
        }).catch(onError);
        pump();
    }
    function add(key, task) {
        if (pending.has(key) || running.has(key) || pending.size >= maxPending) return false;
        pending.set(key, task);
        pump();
        return true;
    }
    function cancel(key) { pending.delete(key); }
    function clear() {
        pending.clear();
        if (timer) clearTimer(timer);
        timer = null;
    }
    return { add, cancel, clear, stats: () => ({ queued: pending.size, active: running.size }) };
}
module.exports = { createWorkQueue };
