import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'copy-icon',
            closeBundle() {
                const distAssets = join(__dirname, 'dist', 'assets');
                mkdirSync(distAssets, { recursive: true });
                for (const name of ['Subly.ico', 'Subly.icns']) {
                    const src = join(__dirname, 'src', 'assets', name);
                    if (existsSync(src)) copyFileSync(src, join(distAssets, name));
                }
            }
        },
        {
            // The CSP lives in dist/index.html only. Injected here because the
            // dev server needs an open connect-src for its HMR websocket, while
            // the production build inside Electron talks to nothing but IPC.
            name: 'inject-csp',
            apply: 'build',
            transformIndexHtml(html) {
                return html.replace(
                    '<!--CSP-->',
                    '<meta http-equiv="Content-Security-Policy"\n'
                    + '        content="default-src \'none\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\';'
                    + ' img-src \'self\' data:; font-src \'self\'; connect-src \'none\'; base-uri \'none\'; form-action \'none\'" />'
                );
            }
        }
    ],
    root: 'src',
    build: {
        outDir: '../dist',
        emptyOutDir: true
    },
    base: './'
});
