const mongoose = require("mongoose");
const fs = require('fs');
const { redact } = require('../utils/redact');
const { startCacheConnection } = require('../db/cacheConnection');
const mongoEventFiles = fs.readdirSync("./src/mongoEvents").filter(file => file.endsWith(".js"));

module.exports = (client) => {
    client.dbLogin = async () => {
        for (file of mongoEventFiles) {
            const event = require(`../mongoEvents/${file}`);
            if (event.once) {
                mongoose.connection.once(event.name, (...args) => event.execute(...args));
            } else {
                mongoose.connection.on(event.name, (...args) => event.execute(...args));
            }
        }
        mongoose.promise = global.Promise;
        // The cache cluster connects in the background. A missing URI, a refused
        // host, or a slow Atlas cluster must not delay or fail this login.
        startCacheConnection();
        try {
            // Database name in the URI is ignored. Unset MIKADATABASENAME uses "mika", not MongoDB's default "test".
            await mongoose.connect(process.env.MIKADATABASE, { dbName: process.env.MIKADATABASENAME || 'mika' });
        } catch (error) {
            console.error('Database connection failed.', redact(error));
        }
    };
};
