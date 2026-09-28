// Subly — Main Process
// Sandboxed Electron app loaded by DaVinci Resolve as a Workflow Integration Plugin.

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupResolveHandlers, cleanupResolveInterface } = require('./ipc/resolve');
const { setupConfigHandlers } = require('./ipc/config');
const { getSystemFonts } = require('./ipc/fonts');
const { createCleanupController } = require('./ipc/mainLifecycle');
const { checkForUpdate } = require('./ipc/updates');

let mainWindow = null;

// The hosted plugin runs Resolve's own Electron binary, so app.getVersion()
// reports DaVinci's version, not ours. package.json is the single source of
// truth (it ships inside the plugin folder and manifest.xml bumps with it).
function getAppVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
        return String(pkg.version || app.getVersion());
    } catch {
        return app.getVersion();
    }
}

function createWindow() {
    const isMac = process.platform === 'darwin';
    mainWindow = new BrowserWindow({
        width: 755,
        height: 615,
        minWidth: 625,
        minHeight: 615,
        // NOT always-on-top (per requirement) — behaves like a normal window.
        alwaysOnTop: false,
        frame: isMac,
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        ...(isMac
            ? { trafficLightPosition: { x: 12, y: 10 } }
            // Windows Controls Overlay: the OS itself draws the caption buttons
            // (min/max/close, incl. the Win11 snap flyout) over our titlebar,
            // instead of the custom HTML buttons. The overlay color carries a
            // 00 alpha: nothing is painted, so the titlebar (and its bottom
            // border) shows through — but the RGB part still matters, because
            // Chromium derives the buttons' hover shade from its luminance
            // (light base -> dark hover, dark base -> light hover). Re-synced
            // to the active theme via window:setTitleBarOverlay.
            : process.platform === 'win32'
                ? { titleBarOverlay: { color: '#11111100', symbolColor: '#e0e0e0', height: 36 } }
                : {}),
        autoHideMenuBar: true,
        useContentSize: true,
        backgroundColor: '#0d0d0d',
        icon: path.join(__dirname, 'dist', 'assets', 'Subly.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // These match Electron's secure defaults; pinned explicitly so a future
            // upgrade or accidental edit can't silently grant the renderer Node access.
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true
        }
    });

    mainWindow.on('close', () => {
        app.quit();
    });

    // The UI is fully local — never let it open new windows or navigate away
    // from the bundled dist/index.html (defense against any injected link).
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url !== mainWindow.webContents.getURL()) event.preventDefault();
    });

    // Taskbar icon. When DaVinci Resolve hosts this plugin the window runs inside
    // Resolve's own process, so the taskbar button inherits Resolve's icon and
    // app.setAppUserModelId() (a process-wide setting) gets ignored/overwritten.
    // setAppDetails() is the PER-WINDOW override: giving the window its own appId
    // (AppUserModelID) un-groups it from Resolve's taskbar button, and appIconPath
    // then sets that button's icon. appId is mandatory — without it appIconPath is
    // ignored (per the Electron docs). setIcon() additionally covers the window
    // frame / Alt-Tab. .ico is the reliable format on Windows and must carry the
    // small sizes (16/24/32) or the taskbar can't downscale it and falls back to
    // the host icon.
    if (process.platform === 'win32') {
        const { nativeImage } = require('electron');
        // Prod: ico ships in dist/assets (copied by build). Dev: fallback to src/assets.
        const fs = require('fs');
        const candidates = [
            path.join(__dirname, 'dist', 'assets', 'Subly.ico'),
            path.join(__dirname, 'src', 'assets', 'Subly.ico')
        ];
        const icoPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
        mainWindow.setAppDetails({ appId: 'com.shinsha.subly', appIconPath: icoPath, appIconIndex: 0 });
        const img = nativeImage.createFromPath(icoPath);
        if (!img.isEmpty()) mainWindow.setIcon(img);
    }

    // Tell the renderer when the maximized state changes (also covers OS-driven
    // maximize: double-click titlebar, Win+Up, snap) so the titlebar button can
    // toggle between Maximize and Restore-Down like a normal window.
    mainWindow.on('maximize', () => mainWindow.webContents.send('window:maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false));

    // Render at native DPI like the PyQt build — never let the page zoom drift.
    // Pin the factor at 1.0 and block the Ctrl +/-/0 and Ctrl-wheel shortcuts so
    // the user can't shrink/grow the whole UI (they asked for no such combo).
    const wc = mainWindow.webContents;
    wc.on('did-finish-load', () => {
        wc.setZoomFactor(1);
        wc.setVisualZoomLevelLimits(1, 1).catch(() => {});
    });
    wc.setZoomFactor(1);
    wc.on('zoom-changed', () => wc.setZoomFactor(1));
    wc.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !input.control) return;
        const k = (input.key || '').toLowerCase();
        if (k === '+' || k === '-' || k === '=' || k === '0' ||
            k === 'add' || k === 'subtract' || k === 'numpadadd' || k === 'numpadsubtract') {
            event.preventDefault();
        }
    });

    mainWindow.loadFile('dist/index.html');
}

app.whenReady().then(() => {
    // Windows groups taskbar buttons (and picks the taskbar icon) by AppUserModelID.
    // Without an explicit ID a dev-run Electron app shows the default Electron
    // icon in the taskbar even though the window icon is set — pin our own ID so
    // the Subly.ico shows there too.
    if (process.platform === 'win32') app.setAppUserModelId('com.shinsha.subly');
    // macOS: BrowserWindow.icon is ignored (no per-window icons). The plugin's
    // Electron child process gets its own dock entry, so app.dock.setIcon() with
    // the .icns brands that dock tile (and Cmd-Tab) without touching Resolve's.
    if (process.platform === 'darwin' && app.dock) {
        const { nativeImage } = require('electron');
        const fs = require('fs');
        const candidates = [
            path.join(__dirname, 'dist', 'assets', 'Subly.icns'),
            path.join(__dirname, 'src', 'assets', 'Subly.icns')
        ];
        const icnsPath = candidates.find(p => fs.existsSync(p));
        if (icnsPath) {
            const img = nativeImage.createFromPath(icnsPath);
            if (!img.isEmpty()) app.dock.setIcon(img);
        }
    }
    createWindow();
    setupResolveHandlers(ipcMain);
    setupConfigHandlers(ipcMain);

    ipcMain.handle('window:resize', (_event, { width, height }) => {
        if (mainWindow && Number.isFinite(width) && Number.isFinite(height)) {
            mainWindow.setSize(Math.round(width), Math.round(height));
        }
        return getWindowState();
    });
    // Minimum size depends on whether the editor is open: with the editor
    // visible the window must stay wide enough for both panels (no cramping, no
    // horizontal scrollbar); closed it can shrink further.
    ipcMain.handle('window:setMinSize', (_event, { width, height }) => {
        if (mainWindow) {
            mainWindow.setMinimumSize(Math.round(width), Math.round(height));
            // If the window is currently smaller than the new minimum, grow it.
            const [w, h] = mainWindow.getSize();
            if (!mainWindow.isMaximized() && (w < width || h < height)) {
                mainWindow.setSize(Math.max(w, Math.round(width)), Math.max(h, Math.round(height)));
            }
        }
        return getWindowState();
    });
    ipcMain.handle('window:minimize', () => {
        if (mainWindow) mainWindow.minimize();
        return getWindowState();
    });
    ipcMain.handle('window:toggleMaximize', () => {
        if (!mainWindow) return getWindowState();
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
        return getWindowState();
    });
    ipcMain.handle('window:close', () => {
        if (mainWindow) mainWindow.close();
        return { closed: true };
    });
    // The renderer (owner of the theme) sends the titlebar bg + text colors.
    // The bg is applied with a 00 alpha: the overlay paints nothing (titlebar
    // border stays visible), but Chromium still uses the RGB luminance to pick
    // the hover shade for the caption buttons. Height lives here so it can't
    // drift from the CSS titlebar. Win-only — other platforms never call this.
    ipcMain.handle('window:setTitleBarOverlay', (_event, overlay) => {
        if (process.platform !== 'win32' || !mainWindow) return;
        const hex = (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);
        const color = hex(overlay && overlay.color);
        const symbolColor = hex(overlay && overlay.symbolColor);
        if (color && symbolColor) mainWindow.setTitleBarOverlay({ color: color + '00', symbolColor, height: 36 });
    });
    ipcMain.handle('window:getState', () => getWindowState());
    // Scanning the font library takes ~2s on a fat Windows install; awaiting the
    // async scan keeps the main process repainting and answering other IPC while
    // it runs (the result is memoised, so only the first call pays).
    ipcMain.handle('app:getFonts', async () => await getSystemFonts());
    ipcMain.handle('app:checkForUpdate', () => checkForUpdate(getAppVersion()));
    ipcMain.handle('app:getVersion', () => getAppVersion());
    ipcMain.handle('shell:openExternal', (_event, url) => {
        // Only hand http(s)/mailto URLs to the OS — never file:, smb:, etc.
        if (typeof url === 'string' && /^(https?|mailto):/i.test(url)) {
            return shell.openExternal(url).catch(() => {});
        }
    });
    // NOTE: there is deliberately no 'shell:openPath' handler. shell.openPath
    // launches a local file with its OS default handler — a process-spawn
    // primitive — and nothing in the renderer ever needed it.
});

function getWindowState() {
    if (!mainWindow) return { maximized: false, fullScreen: false };
    const [width, height] = mainWindow.getSize();
    return {
        width,
        height,
        maximized: mainWindow.isMaximized(),
        fullScreen: mainWindow.isFullScreen()
    };
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// Repeated quit attempts are still cancelled while cleanup is in flight; only
// the final app.quit() issued after cleanup is allowed through.
const cleanupController = createCleanupController(cleanupResolveInterface, () => app.quit());
app.on('before-quit', cleanupController.beforeQuit);

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
