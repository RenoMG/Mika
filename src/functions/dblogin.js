const mongoose = require("mongoose");
const fs = require('fs');
const { redact } = require('../utils/redact');
const { startCacheConnection } = require('../db/cacheConnection');
const path = require('path');
const mongoEventFiles = fs.readdirSync(path.join(__dirname, '..', 'mongoEvents')).filter((file) => file.endsWith('.js'));

module.exports = (client) => {
    client.dbLogin = async () => {
        for (const file of mongoEventFiles) {
            const event = require(`../mongoEvents/${file}`);
            if (event.once) {
                mongoose.connection.once(event.name, (...args) => event.execute(...args));
            } else {
                mongoose.connection.on(event.name, (...args) => event.execute(...args));
            }
        }
        // The cache cluster connects in the background. A missing URI, a refused
        // host, or a slow Atlas cluster must not delay or fail this login.
        startCacheConnection();
        try {
            // Database name in the URI is ignored. Unset MIKADATABASENAME uses "mika", not MongoDB's default "test".
            await mongoose.connect(process.env.MIKADATABASE, {
                dbName: process.env.MIKADATABASENAME || 'mika',
                autoIndex: false,
                serverSelectionTimeoutMS: 10000,
                // One bot process. A small warm pool avoids a cold handshake on the
                // first message after a quiet spell without holding 100 sockets open.
                maxPoolSize: 20,
                minPoolSize: 2,
                maxIdleTimeMS: 5 * 60 * 1000,
            });
            await require('../db/migrations').verifyIndexes();
        } catch (error) {
            console.error('Database connection failed.', redact(error));
            throw error;
        }
    };
};
