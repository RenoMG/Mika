// Discord closes the interaction before we answer (10062) or we already did (40060).
// Those are expiry races, not failures to show the user.

const QUIET_CODES = new Set([10062, 40060]);

function apiCode(error) {
    if (!error || typeof error !== 'object') return null;
    if (typeof error.code === 'number' && Number.isInteger(error.code)) return error.code;
    if (typeof error.code === 'string' && /^\d+$/.test(error.code)) return Number(error.code);
    const raw = error.rawError && error.rawError.code;
    if (typeof raw === 'number' && Number.isInteger(raw)) return raw;
    const name = typeof error.name === 'string' ? error.name : '';
    const message = typeof error.message === 'string' ? error.message : '';
    const match = /\[(\d+)\]/.exec(name) || /\[(\d+)\]/.exec(message);
    return match ? Number(match[1]) : null;
}

function isQuietError(error) {
    return QUIET_CODES.has(apiCode(error));
}

module.exports = {
    QUIET_CODES,
    apiCode,
    isQuietError,
};
