const mongoose = require("mongoose");
const fs = require('fs');
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
        // Database name in the URI is ignored. Unset MIKADATABASENAME uses "mika", not MongoDB's default "test".
        await mongoose.connect(process.env.MIKADATABASE, { dbName: process.env.MIKADATABASENAME || 'mika' });
    };
};