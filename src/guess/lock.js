function createLocks() {
    const held = new Set();
    return {
        acquire(id) {
            const key = String(id);
            if (!key || held.has(key)) return false;
            held.add(key);
            return true;
        },
        release(id) {
            held.delete(String(id));
        },
        held(id) {
            return held.has(String(id));
        },
        clear() {
            held.clear();
        },
    };
}

const locks = createLocks();

module.exports = {
    createLocks,
    locks,
};
