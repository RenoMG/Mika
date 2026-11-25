const { redact } = require('../utils/redact');

module.exports = {
	name: 'error',
	async execute(error) {
		console.error('Database error.', redact(error));
	},
};