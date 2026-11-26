// discord.js reports a gateway ping of -1 until the first heartbeat is
// acknowledged (about 40s after login or a reconnect). Use the measured
// round trip to Discord until then.
function latencyMs(client, roundTripMs) {
    const ping = client && client.ws ? client.ws.ping : NaN;
    if (Number.isFinite(ping) && ping >= 0) return Math.round(ping);
    return Math.max(0, Math.round(roundTripMs));
}

module.exports = { latencyMs };
