const mongoose = require('mongoose');

// Mongoose 7+ dropped query callbacks. Rodger's commands still pass (err, doc) callbacks.
// Translate those calls onto the promise API without rewriting every command.
const originalFindOne = mongoose.Model.findOne;

mongoose.Model.findOne = function findOneWithCallback(...args) {
  const callback = args[args.length - 1];
  if (typeof callback !== 'function') {
    return originalFindOne.apply(this, args);
  }

  const promise = originalFindOne.apply(this, args.slice(0, -1));
  promise.then(
    (doc) => callback(null, doc),
    (err) => callback(err, null)
  );
  return promise;
};
