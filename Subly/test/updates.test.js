import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    checkForUpdate,
    compareVersions,
    isSafeReleaseUrl,
    normalizeVersion
} = require('../ipc/updates.js');

describe('GitHub release update checker', () => {
    it('normalizes v-prefixed versions and compares semantic versions', () => {
        expect(normalizeVersion('v1.2.0')).toEqual({ major: 1, minor: 2, patch: 0, prerelease: '' });
        expect(compareVersions('1.3.0', '1.2.9')).toBe(1);
        expect(compareVersions('1.2.0', 'v1.2.0')).toBe(0);
        expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(-1);
    });

    it('only accepts the project GitHub release URL', () => {
        expect(isSafeReleaseUrl('https://github.com/Shinsha1337/subly/releases/tag/v1.3.0')).toBe(true);
        expect(isSafeReleaseUrl('http://github.com/Shinsha1337/subly/releases/tag/v1.3.0')).toBe(false);
        expect(isSafeReleaseUrl('https://example.com/installer.exe')).toBe(false);
    });

    it('reports a newer stable release without downloading it', async () => {
        const result = await checkForUpdate('1.2.0', async () => ({
            tag_name: 'v1.3.0',
            name: 'Subly 1.3.0',
            html_url: 'https://github.com/Shinsha1337/subly/releases/tag/v1.3.0',
            draft: false,
            prerelease: false,
            published_at: '2026-07-28T00:00:00Z'
        }));

        expect(result).toMatchObject({
            ok: true,
            updateAvailable: true,
            currentVersion: '1.2.0',
            latestVersion: '1.3.0',
            releaseUrl: 'https://github.com/Shinsha1337/subly/releases/tag/v1.3.0'
        });
    });

    it('does not offer drafts or prereleases', async () => {
        const draft = await checkForUpdate('1.2.0', async () => ({
            tag_name: 'v2.0.0',
            html_url: 'https://github.com/Shinsha1337/subly/releases/tag/v2.0.0',
            draft: true,
            prerelease: false
        }));
        const prerelease = await checkForUpdate('1.2.0', async () => ({
            tag_name: 'v2.0.0-beta.1',
            html_url: 'https://github.com/Shinsha1337/subly/releases/tag/v2.0.0-beta.1',
            draft: false,
            prerelease: true
        }));

        expect(draft.updateAvailable).toBe(false);
        expect(prerelease.updateAvailable).toBe(false);
    });

    it('fails closed when GitHub is unavailable', async () => {
        const result = await checkForUpdate('1.2.0', async () => {
            throw new Error('offline');
        });

        expect(result).toMatchObject({ ok: false, updateAvailable: false, currentVersion: '1.2.0' });
    });
});
