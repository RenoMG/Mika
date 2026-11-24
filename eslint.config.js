const globals = require('globals');
const promise = require('eslint-plugin-promise');
module.exports = [
    { ignores: ['node_modules/**'] },
    { files: ['src/**/*.js', 'scripts/**/*.js', 'mika.js'],
        languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node },
        plugins: { promise },
        rules: { 'no-undef': 'error', 'no-global-assign': 'error', 'no-async-promise-executor': 'error', 'promise/catch-or-return': 'error' },
    },
];
