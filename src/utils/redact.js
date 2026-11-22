function redact(value) {
    const text = value instanceof Error
        ? `${value.name || 'Error'}: ${value.message}\n${value.stack || ''}`
        : String(value);
    return text
        .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://[redacted]')
        .replace(/\b[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g, '[redacted-token]');
}

module.exports = { redact };
