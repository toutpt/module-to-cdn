'use strict';

const semver = require('semver');

const modules = require('./modules');
const {getURL, setURL} = require('./url');

function main(moduleName, version, options) {
    options = options || {};
    const env = options.env || 'development';

    if (typeof moduleName !== 'string') {
        throw new TypeError('Expected \'moduleName\' to be a string');
    }

    if (typeof version !== 'string') {
        throw new TypeError('Expected \'version\' to be a string');
    }

    const isModuleAvailable = moduleName in modules;
    if (!isModuleAvailable) {
        return null;
    }

    const range = Object.keys(modules[moduleName].versions)
        .find(range => semver.satisfies(version, range));
    const config = modules[moduleName].versions[range];

    if (config == null) {
        return null;
    }

    let path = env === 'development' ? config.development : config.production;
    let url;
    if (path.startsWith('/')) {
        url = getURL({
            name: moduleName,
            version,
            path
        });
    } else {
        url = path.replace('[version]', version);
        path = undefined;
    }

    return {
        name: moduleName,
        var: modules[moduleName].var || modules[moduleName].versions[range].var,
        url,
        version,
        path
    };
}

main.configure = setURL;
main.unpkg = getURL;
module.exports = main;

