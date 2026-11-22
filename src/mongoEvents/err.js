const { redact } = require('../utils/redact');

module.exports = {
	name: 'err',
	async execute(error) {
		console.log(redact(error));
	},
};