'use strict';

const https = require('node:https');

const RELEASES_URL = 'https://api.github.com/repos/Shinsha1337/subly/releases/latest';
const RELEASE_PAGE_PREFIX = 'https://github.com/Shinsha1337/subly/releases/tag/';
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function normalizeVersion(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(VERSION_RE);
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        prerelease: match[4] || ''
    };
}

function comparePrerelease(left, right) {
    if (!left && !right) return 0;
    if (!left) return 1;
    if (!right) return -1;

    const leftParts = left.split('.');
    const rightParts = right.split('.');
    const length = Math.max(leftParts.length, rightParts.length);
    for (let i = 0; i < length; i += 1) {
        if (i >= leftParts.length) return -1;
        if (i >= rightParts.length) return 1;
        const a = leftParts[i];
        const b = rightParts[i];
        if (a === b) continue;
        const aNumber = /^\d+$/.test(a);
        const bNumber = /^\d+$/.test(b);
        if (aNumber && bNumber) return Number(a) > Number(b) ? 1 : -1;
        if (aNumber !== bNumber) return aNumber ? -1 : 1;
        return a > b ? 1 : -1;
    }
    return 0;
}

function compareVersions(leftValue, rightValue) {
    const left = normalizeVersion(leftValue);
    const right = normalizeVersion(rightValue);
    if (!left || !right) return null;
    for (const key of ['major', 'minor', 'patch']) {
        if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
    }
    return comparePrerelease(left.prerelease, right.prerelease);
}

function isNewerVersion(candidate, current) {
    return compareVersions(candidate, current) === 1;
}

function isSafeReleaseUrl(value) {
    if (typeof value !== 'string' || !value.startsWith(RELEASE_PAGE_PREFIX)) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.hostname === 'github.com'
            && !url.username
            && !url.password
            && url.pathname.startsWith('/Shinsha1337/subly/releases/tag/');
    } catch {
        return false;
    }
}

function versionString(version) {
    return `${version.major}.${version.minor}.${version.patch}${version.prerelease ? `-${version.prerelease}` : ''}`;
}

function fetchLatestRelease(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const request = https.get(RELEASES_URL, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': 'Subly-update-checker/1.2.0'
            }
        }, response => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { body += chunk; });
            response.on('end', () => {
                if (response.statusCode !== 200) {
                    reject(new Error(`GitHub release request returned ${response.statusCode}`));
                    return;
                }
                try {
                    resolve(JSON.parse(body));
                } catch {
                    reject(new Error('GitHub returned invalid release data'));
                }
            });
        });
        request.setTimeout(timeoutMs, () => request.destroy(new Error('GitHub release request timed out')));
        request.on('error', reject);
    });
}

async function checkForUpdate(currentValue, fetchRelease = fetchLatestRelease) {
    const current = normalizeVersion(currentValue);
    const currentVersion = current ? versionString(current) : String(currentValue || '');
    if (!current) return { ok: false, updateAvailable: false, currentVersion };

    try {
        const release = await fetchRelease();
        if (!release || release.draft || release.prerelease) {
            return { ok: true, updateAvailable: false, currentVersion };
        }

        const latest = normalizeVersion(release.tag_name || release.name);
        const releaseUrl = release.html_url;
        if (!latest || !isSafeReleaseUrl(releaseUrl)) {
            return { ok: true, updateAvailable: false, currentVersion };
        }

        const latestVersion = versionString(latest);
        return {
            ok: true,
            updateAvailable: isNewerVersion(latestVersion, currentVersion),
            currentVersion,
            latestVersion,
            releaseName: typeof release.name === 'string' ? release.name : `Subly ${latestVersion}`,
            releaseUrl,
            publishedAt: typeof release.published_at === 'string' ? release.published_at : ''
        };
    } catch {
        return { ok: false, updateAvailable: false, currentVersion };
    }
}

module.exports = {
    checkForUpdate,
    compareVersions,
    fetchLatestRelease,
    isNewerVersion,
    isSafeReleaseUrl,
    normalizeVersion
};
