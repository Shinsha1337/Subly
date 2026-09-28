const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const FONT_FILE = /\.(ttf|otf|ttc)$/i;
const REGISTRY_KIND_SUFFIX = /\s*\((TrueType|OpenType|Type 1|Raster|Collection)\)\s*$/i;
const FONT_EXTENSION_SUFFIX = /\.(ttf|otf|ttc|fon)$/i;
const STYLE_TOKEN = 'ExtraLight|UltraLight|SemiBold|Semibold|DemiBold|ExtraBold|UltraBold|Regular|Roman|Book|Medium|Light|Thin|Bold|Black|Italic|Oblique|Condensed|Demi';
const STYLE_SUFFIX = new RegExp(`\\s+((?:${STYLE_TOKEN})(?:\\s+(?:${STYLE_TOKEN}))*)$`, 'i');

function cleanName(value) {
    return String(value || '').replace(/^@/, '').replace(/\0/g, '').replace(/\s+/g, ' ').trim();
}

function parseFallbackFace(name) {
    const cleaned = cleanName(name)
        .replace(REGISTRY_KIND_SUFFIX, '')
        .replace(FONT_EXTENSION_SUFFIX, '')
        .trim();
    if (!cleaned) return null;

    const separated = cleaned.match(/^(.*?)\s*:\s*(.+)$/);
    if (separated) {
        const family = cleanName(separated[1]);
        const style = cleanName(separated[2]);
        return family ? { family, style: style || 'Regular' } : null;
    }

    const suffix = cleaned.match(STYLE_SUFFIX);
    if (suffix) {
        const family = cleanName(cleaned.slice(0, suffix.index));
        return family ? { family, style: cleanName(suffix[1]) || 'Regular' } : null;
    }

    return { family: cleaned, style: 'Regular' };
}

function cleanFallbackName(name) {
    return parseFallbackFace(name)?.family || '';
}

function decodeUtf16Be(buffer) {
    const evenLength = buffer.length - (buffer.length % 2);
    const swapped = Buffer.allocUnsafe(evenLength);
    for (let i = 0; i < evenLength; i += 2) {
        swapped[i] = buffer[i + 1];
        swapped[i + 1] = buffer[i];
    }
    return swapped.toString('utf16le');
}

function decodeName(buffer, platformId) {
    const decoded = platformId === 0 || platformId === 3
        ? decodeUtf16Be(buffer)
        : buffer.toString('latin1');
    return cleanName(decoded);
}

function readSfntFace(buffer, sfntOffset) {
    if (sfntOffset < 0 || sfntOffset + 12 > buffer.length) return null;
    const tableCount = buffer.readUInt16BE(sfntOffset + 4);
    let nameOffset = null;
    let nameLength = 0;

    for (let i = 0; i < tableCount; i += 1) {
        const recordOffset = sfntOffset + 12 + (i * 16);
        if (recordOffset + 16 > buffer.length) break;
        if (buffer.toString('ascii', recordOffset, recordOffset + 4) !== 'name') continue;
        nameOffset = buffer.readUInt32BE(recordOffset + 8);
        nameLength = buffer.readUInt32BE(recordOffset + 12);
        break;
    }

    if (nameOffset == null || nameOffset + 6 > buffer.length || nameOffset + nameLength > buffer.length) return null;
    const recordCount = buffer.readUInt16BE(nameOffset + 2);
    const stringsOffset = nameOffset + buffer.readUInt16BE(nameOffset + 4);
    const candidates = new Map();

    for (let i = 0; i < recordCount; i += 1) {
        const recordOffset = nameOffset + 6 + (i * 12);
        if (recordOffset + 12 > buffer.length) break;
        const platformId = buffer.readUInt16BE(recordOffset);
        const languageId = buffer.readUInt16BE(recordOffset + 4);
        const nameId = buffer.readUInt16BE(recordOffset + 6);
        if (![1, 2, 16, 17].includes(nameId)) continue;
        const length = buffer.readUInt16BE(recordOffset + 8);
        const offset = stringsOffset + buffer.readUInt16BE(recordOffset + 10);
        if (offset < 0 || offset + length > buffer.length) continue;
        const value = decodeName(buffer.subarray(offset, offset + length), platformId);
        if (!value || value.startsWith('@')) continue;
        const score = (platformId === 3 ? 20 : platformId === 0 ? 15 : 0)
            + (languageId === 0x0409 || languageId === 0 ? 10 : 0);
        const current = candidates.get(nameId);
        if (!current || score > current.score) candidates.set(nameId, { value, score });
    }

    const family = cleanName(candidates.get(16)?.value || candidates.get(1)?.value);
    const style = cleanName(candidates.get(17)?.value || candidates.get(2)?.value || 'Regular');
    return family ? { family, style: style || 'Regular' } : null;
}

function parseFontBuffer(buffer) {
    if (buffer.length < 12) return [];

    const offsets = [];
    if (buffer.toString('ascii', 0, 4) === 'ttcf') {
        const fontCount = Math.min(buffer.readUInt32BE(8), 128);
        for (let i = 0; i < fontCount; i += 1) {
            const offsetPosition = 12 + (i * 4);
            if (offsetPosition + 4 > buffer.length) break;
            offsets.push(buffer.readUInt32BE(offsetPosition));
        }
    } else {
        offsets.push(0);
    }

    return offsets.map(offset => readSfntFace(buffer, offset)).filter(Boolean);
}

// A truncated or corrupt font can still make the offset arithmetic read past
// the buffer — swallow it per file so one bad file can't abort the whole scan.
function readFontFaces(filePath) {
    let buffer;
    try { buffer = fs.readFileSync(filePath); } catch { return []; }
    try { return parseFontBuffer(buffer); } catch { return []; }
}

async function readFontFacesAsync(filePath) {
    let buffer;
    try { buffer = await fs.promises.readFile(filePath); } catch { return []; }
    try { return parseFontBuffer(buffer); } catch { return []; }
}

function readFontFamilies(filePath) {
    return Array.from(new Set(readFontFaces(filePath).map(face => face.family)));
}

function styleRank(style) {
    const value = String(style || '').toLocaleLowerCase().replace(/[\s-]/g, '');
    if (value.includes('thin')) return 100;
    if (value.includes('extralight') || value.includes('ultralight')) return 200;
    if (value.includes('light')) return 300;
    if (value.includes('regular') || value.includes('roman') || value.includes('book') || value === 'italic') return 400;
    if (value.includes('medium')) return 500;
    if (value.includes('semibold') || value.includes('demibold') || value === 'demi') return 600;
    if (value.includes('extrabold') || value.includes('ultrabold')) return 800;
    if (value.includes('bold')) return 700;
    if (value.includes('black')) return 900;
    return 450;
}

function buildFontCatalog(faces) {
    const families = new Map();
    for (const rawFace of faces || []) {
        const fallback = typeof rawFace === 'string' ? parseFallbackFace(rawFace) : null;
        let family = cleanName(fallback?.family || rawFace?.family);
        let style = cleanName(fallback?.style || rawFace?.style || 'Regular');
        if (!family) continue;

        const legacyCombined = family.match(/^(.*?)\s*:\s*(.+)$/);
        if (legacyCombined) {
            family = cleanName(legacyCombined[1]);
            if (!style || style === 'Regular') style = cleanName(legacyCombined[2]);
        }

        const familyKey = family.toLocaleLowerCase();
        if (!families.has(familyKey)) families.set(familyKey, { family, styles: new Map() });
        const entry = families.get(familyKey);
        const safeStyle = style || 'Regular';
        const styleKey = safeStyle.toLocaleLowerCase();
        if (!entry.styles.has(styleKey)) entry.styles.set(styleKey, safeStyle);
    }

    return Array.from(families.values())
        .map(entry => ({
            family: entry.family,
            styles: Array.from(entry.styles.values()).sort((a, b) => {
                const rank = styleRank(a) - styleRank(b);
                return rank || a.localeCompare(b, undefined, { sensitivity: 'base' });
            })
        }))
        .sort((a, b) => a.family.localeCompare(b.family, undefined, { sensitivity: 'base' }));
}

function fontDirectories() {
    if (process.platform === 'win32') {
        return [
            path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts'),
            path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts')
        ];
    }
    if (process.platform === 'darwin') {
        return ['/System/Library/Fonts', '/Library/Fonts', path.join(os.homedir(), 'Library', 'Fonts')];
    }
    return ['/usr/share/fonts', '/usr/local/share/fonts', path.join(os.homedir(), '.fonts')];
}

// System32 tools must be launched by absolute path: resolving "reg" through
// PATH would let a planted reg.exe earlier in PATH run inside Resolve's process.
function systemToolPath(exeName) {
    return path.join(process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows', 'System32', exeName);
}

async function getWindowsRegistryFonts() {
    const entries = [];
    const reg = systemToolPath('reg.exe');
    for (const hive of ['HKLM', 'HKCU']) {
        try {
            // Deliberately no windowsHide: with no console attached reg.exe
            // transliterates non-ASCII to '?', which breaks the file paths of
            // fonts installed under a Cyrillic/CJK name.
            const { stdout } = await execFileAsync(
                reg,
                ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`],
                { encoding: 'utf8', timeout: 3000 }
            );
            stdout.split(/\r?\n/).forEach(line => {
                const match = line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/);
                if (match) entries.push({ displayName: match[1], file: match[2] });
            });
        } catch { /* registry is best-effort */ }
    }
    return entries;
}

// Windows paths are case-insensitive and the registry spells them differently
// from the directory walk, so fold case before comparing.
function fontPathKey(filePath) {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLocaleLowerCase() : resolved;
}

async function scanSystemFonts() {
    const faces = [];
    const addFace = face => { if (face?.family) faces.push(face); };
    // The registry entries point straight into %WINDIR%\Fonts, which is also the
    // first directory walked below — without this map every file there would be
    // opened and parsed twice.
    const parsedFiles = new Map();
    const addFromFile = async (filePath) => {
        const key = fontPathKey(filePath);
        if (parsedFiles.has(key)) return parsedFiles.get(key);
        const parsed = await readFontFacesAsync(filePath);
        parsed.forEach(addFace);
        parsedFiles.set(key, parsed.length > 0);
        return parsed.length > 0;
    };
    const directories = fontDirectories();

    if (process.platform === 'win32') {
        const systemFontsDir = directories[0];
        for (const entry of await getWindowsRegistryFonts()) {
            if (/\.fon$/i.test(entry.file)) continue;
            const expanded = entry.file.replace(/%([^%]+)%/g, (_match, key) => process.env[key] || '');
            const filePaths = path.isAbsolute(expanded)
                ? [expanded]
                : [path.join(systemFontsDir, expanded), path.join(directories[1], expanded)];
            let parsed = false;
            for (const filePath of filePaths) {
                parsed = await addFromFile(filePath);
                if (parsed) break;
            }
            if (!parsed) addFace(parseFallbackFace(entry.displayName));
        }
    }

    const walk = async (dir, depth = 0) => {
        if (depth > 3) return;
        let entries = [];
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) await walk(fullPath, depth + 1);
            else if (FONT_FILE.test(entry.name)) await addFromFile(fullPath);
        }
    };
    for (const dir of directories) await walk(dir);

    return buildFontCatalog(faces);
}

// Installing or removing a font touches the mtime of the directory holding it,
// so the directory stamps are enough to spot a stale catalogue without
// stat'ing the thousands of files inside them.
// A directory's mtime changes when a file is added directly inside it, but not
// when one lands in a subdirectory — so the immediate children are stamped too.
// That is one readdir plus a stat per child, still nothing next to parsing every
// font file, and it keeps the signature cheap enough to compute on every call.
async function fontDirectorySignature() {
    const stamps = await Promise.all(fontDirectories().map(async (dir) => {
        try {
            const stats = await fs.promises.stat(dir);
            let childStamp = '';
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const childTimes = await Promise.all(
                    entries.filter(e => e.isDirectory()).map(async (e) => {
                        try {
                            const s = await fs.promises.stat(path.join(dir, e.name));
                            return `${e.name}:${s.mtimeMs}`;
                        } catch {
                            return `${e.name}:-`;
                        }
                    })
                );
                childStamp = childTimes.sort().join(',');
            } catch { /* unreadable dir — the parent stamp still covers it */ }
            return `${dir}:${stats.mtimeMs}:${childStamp}`;
        } catch {
            return `${dir}:-`;
        }
    }));
    return stamps.join('|');
}

// Backstop for changes no mtime reflects (a font replaced in place, a nested
// tree deeper than one level). Cheap: it only forces one rescan per interval,
// and only when the fonts are actually asked for.
const CATALOG_TTL_MS = 60000;

let cachedCatalog = null;
let cachedSignature = null;
let cachedAt = 0;
let pendingScan = null;

async function resolveFontCatalog(now) {
    const signature = await fontDirectorySignature();
    const fresh = cachedCatalog
        && signature === cachedSignature
        && (now - cachedAt) < CATALOG_TTL_MS;
    if (fresh) return cachedCatalog;
    const catalog = await scanSystemFonts();
    cachedCatalog = catalog;
    cachedSignature = signature;
    cachedAt = now;
    return catalog;
}

// The Deliver toolbar remounts on every tab switch and asks for the fonts each
// time. Memoise the catalogue and share the in-flight promise — deliberately
// not an async function, so the guard is set before the first await and two
// overlapping calls can never start two scans.
function getSystemFonts() {
    if (!pendingScan) {
        const now = Date.now();
        pendingScan = resolveFontCatalog(now).finally(() => { pendingScan = null; });
    }
    return pendingScan;
}

module.exports = {
    getSystemFonts,
    readFontFaces,
    readFontFamilies,
    parseFallbackFace,
    cleanFallbackName,
    buildFontCatalog
};
