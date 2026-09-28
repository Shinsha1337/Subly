// Browser dev shim — for `npm run dev` ONLY.
//
// In the real plugin the Electron preload (preload.js) exposes window.*API
// objects backed by IPC to DaVinci Resolve. A plain browser has no preload, so
// without this file the app crashes on the first window.windowAPI access.
//
// Two modes:
//   http://127.0.0.1:5173/          — "Resolve not connected" state. Backend
//                                     actions are no-ops with realistic errors.
//   http://127.0.0.1:5173/?demo=1   — simulates a CONNECTED Resolve with one
//                                     timeline, templates and a subtitle track,
//                                     so every tab/button/editor is live.
//
// main.jsx calls installBrowserShim() unconditionally; the first line bails
// when a real preload already defined the APIs.

const DEMO_BLOCKS = [
    { start: '00:00:01,000', end: '00:00:03,200', text: 'Hey everyone, welcome back to the channel.' },
    { start: '00:00:03,400', end: '00:00:06,100', text: 'Today we are taking a look at the brand new update' },
    { start: '00:00:06,300', end: '00:00:08,800', text: 'and honestly, it looks pretty impressive so far.' },
    { start: '00:00:09,000', end: '00:00:11,500', text: 'Let me show you how the new caption workflow goes.' },
    { start: '00:00:11,700', end: '00:00:14,200', text: 'You pick a template, pull the subtitles in,' },
    { start: '00:00:14,400', end: '00:00:17,000', text: 'group them into phrases, and hit Create Captions.' }
];

export function installBrowserShim() {
    if (window.windowAPI) return;

    const demo = /[?&]demo=1/.test(window.location.search);
    const showUpdate = !/[?&]noupdate=1/.test(window.location.search);

    let cfg = {
        theme: 'dark',
        language: 'Auto',
        active_preset: 'Default',
        presets: { Default: {} },
        emphasis_colors: [],
        favorite_fonts: []
    };

    window.windowAPI = {
        platform: 'win32',
        resize: async () => ({}),
        setMinSize: async () => ({}),
        minimize: async () => ({}),
        toggleMaximize: async () => ({}),
        close: async () => ({}),
        getState: async () => ({ width: 755, height: 615, maximized: false, fullScreen: false }),
        setTitleBarOverlay: async (_overlay) => ({}),
        resetZoom: () => {},
        onMaximizeChange: (_cb) => () => {},
        openExternal: async (url) => { window.open(url, '_blank', 'noopener'); },
        getVersion: async () => '1.2.0',
        getFonts: async () => ['Arial', 'Segoe UI', 'Consolas', 'Times New Roman']
    };

    window.configAPI = {
        get: async () => cfg,
        set: async (patch) => { cfg = { ...cfg, ...patch }; return cfg; }
    };

    window.updateAPI = {
        check: async () => (showUpdate ? {
            ok: true,
            updateAvailable: true,
            latestVersion: 'v1.3.0',
            releaseUrl: 'https://github.com/Shinsha1337/subly/releases/tag/v1.3.0'
        } : { ok: false })
    };

    const offline = { ok: false, error: 'Not connected to DaVinci Resolve' };

    window.resolveAPI = demo ? {
        connect: async () => ({ ok: true, name: 'Demo Timeline' }),
        ping: async () => ({ ok: true }),
        getFusionTemplates: async () => ({ ok: true, templates: ['Subly Captions', 'Subly Word Highlight'] }),
        importTemplateBin: async () => ({ ok: true, templates: ['Subly Captions', 'Subly Word Highlight'] }),
        getSubtitleTracks: async () => ({ ok: true, tracks: [{ idx: 1, name: 'Subtitle 1 (English)' }] }),
        getSubtitlesFromTrack: async (_trackIndex) => ({ ok: true, blocks: DEMO_BLOCKS.map(b => ({ ...b })) }),
        applySubtitlesToTrack: async (_trackIndex, _blocks) => ({ ok: true }),
        transcribeAudio: async (_language, _charsPerLine) => ({ ok: true }),
        createPreviewCaption: async (_templateName) => ({ ok: true }),
        updatePreviewCaption: async (_payload) => ({ ok: true }),
        deletePreviewCaption: async () => ({ ok: true, deleted: 0 }),
        sendFusionTextTitles: async (payload) => ({
            ok: true,
            created: (payload && payload.blocks ? payload.blocks.length : 0),
            requested: (payload && payload.blocks ? payload.blocks.length : 0)
        }),
        setPlayhead: async (_tc) => ({}),
        diagnoseFusion: async () => ({ ok: true }),
        getTimelineSettings: async () => ({ ok: true, fps: 24, width: 1920, height: 1080 })
    } : {
        connect: async () => ({ ok: false }),
        ping: async () => ({ ok: false }),
        getFusionTemplates: async () => ({ ok: false, templates: [] }),
        importTemplateBin: async () => offline,
        getSubtitleTracks: async () => ({ ok: false, tracks: [] }),
        getSubtitlesFromTrack: async (_trackIndex) => offline,
        applySubtitlesToTrack: async (_trackIndex, _blocks) => offline,
        transcribeAudio: async (_language, _charsPerLine) => offline,
        createPreviewCaption: async (_templateName) => offline,
        updatePreviewCaption: async (_payload) => ({ ok: false }),
        deletePreviewCaption: async () => ({ ok: true, deleted: 0 }),
        sendFusionTextTitles: async (_payload) => offline,
        setPlayhead: async (_tc) => ({}),
        diagnoseFusion: async () => ({ ok: false }),
        getTimelineSettings: async () => ({ ok: false })
    };
}
