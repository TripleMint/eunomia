/* eslint-disable global-require */

const path = require('path');
const tsNode = require('ts-node');

tsNode.register({
    project: path.join(process.cwd(), 'tsconfig.json'),
});

module.exports = {
    rules: {
        'import-order': require('./rules/import-order').default,
    },
};
