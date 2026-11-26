const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

const token = 'bbbbbbbbbbbbbbbbbbbb.CCCCC.dddddddddddddddddddd';

function hide(text) {
    return String(text).split(token).join('[redacted-token]');
}

test('startup fails on an unavailable database before Discord login or registration', { timeout: 30000 }, async () => {
    const child = spawn(process.execPath, ['mika.js'], {
        cwd: path.join(__dirname, '..'),
        detached: true,
        env: {
            ...process.env,
            TOKEN: token,
            APPLICATIONID: '123456789012345678',
            MIKADATABASE: 'mongodb://127.0.0.1:9/mika-boot?serverSelectionTimeoutMS=2000',
            MIKADATABASENAME: 'mika',
            MIKAICON: 'https://example.com/mika.png',
            MONGO_CACHE_URI: '',
        },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
        output += chunk;
    });
    child.stderr.on('data', (chunk) => {
        output += chunk;
    });
    const started = Date.now();
    try {
        while (Date.now() - started < 20000) {
            if (output.includes('Database connection failed.')) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const safe = hide(output);
        assert.equal(safe.includes('Started refreshing application (/) commands.'), false);
        assert.match(safe, /Database connection failed/);
        const commandLines = safe.split('\n').filter((line) => line.startsWith('Command /'));
        assert.equal(commandLines.length, 29, safe);
        assert.ok(commandLines.some((line) => line.startsWith('Command /guess ')), safe);
        assert.doesNotMatch(safe, /TokenInvalid|401/);
        assert.equal(output.includes(token), false);
    } finally {
        try {
            process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
            child.kill('SIGKILL');
        }
    }
});
