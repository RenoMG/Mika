const mongoose = require('mongoose');

// Mongoose 7+ dropped query callbacks. Mika's commands still pass (err, doc) callbacks.
// Translate those calls onto the promise API without rewriting every command.
const originalFindOne = mongoose.Model.findOne;

mongoose.Model.findOne = function findOneWithCallback(...args) {
  const callback = args[args.length - 1];
  const hasCallback = typeof callback === 'function';
  const queryArgs = hasCallback ? args.slice(0, -1) : args;
  const filter = queryArgs[0];

  let promise;
  // Any ConfigurationDB lookup by guild id creates the default document first.
  // Command and event call sites also go through getGuildConfig; this covers a missed findOne.
  if (this.modelName === 'ConfigurationDB' && filter && typeof filter === 'object' && filter.GuildID) {
    const { getGuildConfig } = require('./utils/getGuildConfig');
    promise = getGuildConfig(filter.GuildID);
  } else {
    promise = originalFindOne.apply(this, queryArgs);
  }

  if (!hasCallback) return promise;

  promise.then(
    (doc) => callback(null, doc),
    (err) => callback(err, null)
  );
  return promise;
};
