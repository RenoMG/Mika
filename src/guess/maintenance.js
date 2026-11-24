// One shared pool refresh, at most once per minute. There is no per-server
// refresh queue; every server reuses the same public pool.
function createMaintenance({ now = Date.now, intervalMs = 60000 } = {}) {
    let job = null;
    let nextAt = 0;
    function request(work) {
        if (job) return job;
        if (now() < nextAt) return null;
        nextAt = now() + intervalMs;
        job = Promise.resolve().then(work).catch(() => null).finally(() => { job = null; });
        return job;
    }
    return { request, idle: () => job || Promise.resolve(), reset: () => { nextAt = 0; } };
}
const maintenance = createMaintenance();
module.exports = { createMaintenance, maintenance };
