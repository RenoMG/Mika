const test = require('node:test');
const assert = require('node:assert/strict');
const { latencyMs } = require('../src/utils/latency');

test('latency uses the gateway ping once a heartbeat has landed', () => {
    assert.equal(latencyMs({ ws: { ping: 42.4 } }, 300), 42);
});

test('latency falls back to the round trip while the gateway ping is -1', () => {
    assert.equal(latencyMs({ ws: { ping: -1 } }, 87), 87);
    assert.equal(latencyMs({ ws: { ping: NaN } }, 87), 87);
    assert.equal(latencyMs({}, -5), 0);
});
