#!/usr/bin/env node
/**
 * This script is useful if you want to maintain a CDN.
 */

const queue = require('queue');
const fs = require('fs');
const semver = require('semver');
const {program} = require('commander');
const axios = require('axios');
const moduleToCdn = require('.');
const mkdirp = require('mkdirp');

const {getAllVersions} = moduleToCdn.cache;

const ENVS = ['development', 'production'];

function isPrerelease(v) {
    return semver.parse(v).prerelease.length > 0;
}

function getMatchedVersion(all, globalConstraint = '>= 0.0.0') {
    return function (range) {
        return all
            .filter(version => semver.satisfies(version, globalConstraint))
            .filter(version => semver.satisfies(version, range));
    };
}

function getCDNConfigs(moduleName, downloadVersions, META, options) {
    return downloadVersions.reduce((acc, version) => {
        ENVS.forEach(env => {
            const cdnConfig = moduleToCdn(moduleName, version, {env});
            if (!cdnConfig.url && options.debug) {
                console.error('❌ no url found for', moduleName, version);
                return;
            }

            if (META[cdnConfig.url] || !cdnConfig.url.startsWith('https://unpkg.com')) {
                return;
            }

            acc.push(async () => {
                const response = await axios.get(`${cdnConfig.url}?meta`);
                META[cdnConfig.url] = {
                    integrity: response.data.integrity,
                    lastModified: response.data.lastModified,
                    size: response.data.size
                };

                if (options.debug) {
                    console.log('✅', `${cdnConfig.url}?meta`);
                }
            });
        });
        return acc;
    }, []);
}

function update(options) {
    if (options.debug) {
        console.log('Starting the update');
    }

    const modules = moduleToCdn.getAllModules();

    if (options.debug) {
        console.log('prepare jobs queue');
    }

    Object.keys(modules).forEach(moduleName => {
        const metaPath = `./meta/${moduleName}/meta.json`;
        let META = {};
        if (fs.existsSync(metaPath)) {
            META = require(metaPath);
        } else {
            mkdirp.sync(`meta/${moduleName}`);
        }

        const versionRanges = Object.keys(modules[moduleName].versions);
        const allVersions = getAllVersions(moduleName).filter(v => !isPrerelease(v));
        const downloadVersions = [].concat(...versionRanges.map(getMatchedVersion(allVersions)));

        if (options.debug) {
            console.log(`${downloadVersions.length} versions of ${moduleName}`);
        }

        const configs = getCDNConfigs(moduleName, downloadVersions, META, options);
        const q = queue();
        configs.forEach(config => {
            q.push(config);
        });

        if (options.debug) {
            console.log(`${moduleName} queue is prepared with ${q.length} items in it`);
        }

        q.start(() => {
            if (options.debug) {
                console.log('save meta of', moduleName);
            }

            fs.writeFileSync(metaPath, JSON.stringify(META, null, 2));
        });
    });
}

program
    .version('0.0.1')
    .command('update')
    .action(update)
    .option('-d, --debug', 'no output expected');

program.parse(process.argv);
