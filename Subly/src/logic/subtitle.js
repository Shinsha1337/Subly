// Subly — subtitle logic (ported from subly/subtitle_logic.py)
// Timecode helpers, formatting (case + punctuation), and smart regrouping.

const TIMECODE_RE = /^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/;

export function parseTimecode(tc) {
    if (typeof tc !== 'string') return null;
    const match = tc.trim().match(TIMECODE_RE);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const milliseconds = Number(match[4].padEnd(3, '0'));
    if (minutes > 59 || seconds > 59 || milliseconds > 999) return null;
    return ((hours * 3600 + minutes * 60 + seconds) * 1000) + milliseconds;
}

export function normalizeTimecode(tc) {
    const ms = parseTimecode(tc);
    return ms == null ? null : msToTc(ms);
}

export function isValidTimeRange(start, end) {
    const startMs = parseTimecode(start);
    const endMs = parseTimecode(end);
    return startMs != null && endMs != null && startMs < endMs;
}

export function tcToMs(tc) {
    return parseTimecode(tc) ?? 0;
}

export function msToTc(ms) {
    ms = Math.max(0, Math.floor(ms));
    const h = Math.floor(ms / 3600000); ms %= 3600000;
    const m = Math.floor(ms / 60000); ms %= 60000;
    const s = Math.floor(ms / 1000); ms %= 1000;
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}

export function wordsToChars(words) {
    const w = Math.min(8, Math.max(1, Math.round(Number(words) || 1)));
    return Math.round(6 + (w - 1) * (50 - 6) / (8 - 1));
}

export function syncWordsToText(block, nextText) {
    if (!Array.isArray(block.words)) return block.words;

    // Must segment the same way buildWordStream does. A plain /\s+/ split here
    // collapsed an edited CJK phrase back into one "word", destroying the
    // per-word timing and emphasis that the grouping had just produced — this
    // runs on every keystroke in the Deliver editor.
    const textWords = segmentWords(nextText).map(w => w.text);
    if (!textWords.length) return [];

    const oldWords = block.words;
    if (textWords.length === oldWords.length) {
        return textWords.map((text, i) => ({ ...oldWords[i], text }));
    }

    const startMs = tcToMs(block.start);
    const endMs = tcToMs(block.end);
    const totalDur = Math.max(0, endMs - startMs);
    const totalChars = textWords.reduce((sum, w) => sum + w.length, 0);
    const gapCount = textWords.length - 1;
    const gapUnit = (totalChars && gapCount) ? totalDur * (1 / (totalChars + textWords.length)) : 0;
    const wordBudget = Math.max(0, totalDur - gapUnit * gapCount);
    let current = startMs;

    return textWords.map((text, i) => {
        const wDur = totalChars ? wordBudget * (text.length / totalChars) : 0;
        const start = current;
        const end = Math.min(current + wDur, endMs);
        current += wDur + (i < textWords.length - 1 ? gapUnit : 0);
        return { text, start: msToTc(start), end: msToTc(end) };
    });
}

// Strip punctuation/symbols but keep ALL Unicode letters (incl. accented like
// café/über), digits, combining marks and whitespace — \w + Ѐ-ӿ dropped accents.
const PUNCT_ALL = /[^\p{L}\p{N}\p{M}\s]/gu;
// Full-width variants too — CJK transcripts end sentences with 。！？, never
// with the ASCII forms.
const SENTENCE_ENDERS = new Set(['.', '!', '?', '…', '。', '！', '？']);
// Closing quotes/brackets that may sit AFTER the terminator ("done.’ next") and
// would otherwise hide the sentence end from endsWith.
const TRAILING_QUOTES = /["'’»“”)\]」』]/g;

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Apply text case + punctuation removal. fmt = { text_case, remove_punct, punct_chars }
export function applyFormatting(blocks, fmt) {
    const doCase = (t) => {
        if (fmt.text_case === 'lowercase') return t.toLowerCase();
        if (fmt.text_case === 'UPPERCASE') return t.toUpperCase();
        // Auto / Sentence: capitalize first letter after a sentence ender.
        // \p{L} covers every script we offer in the language list — an ASCII+
        // Cyrillic class let accented starts (über, ça) fall through to the
        // else branch and capitalized the SECOND letter instead.
        let capNext = true;
        let out = '';
        for (const ch of t) {
            if (capNext && /\p{L}/u.test(ch)) {
                out += ch.toUpperCase();
                capNext = false;
            } else {
                out += ch;
                if (SENTENCE_ENDERS.has(ch)) capNext = true;
            }
        }
        return out;
    };

    const doRmPunct = (t) => {
        if (!fmt.remove_punct) return t;
        if (fmt.punct_chars === 'all') return t.replace(PUNCT_ALL, '');
        if (fmt.punct_chars) {
            const re = new RegExp(`[${escapeRegex(fmt.punct_chars)}]`, 'g');
            return t.replace(re, '');
        }
        return t;
    };

    return blocks.map(block => {
        const next = { ...block, text: doCase(doRmPunct(block.text || '')) };
        if (Array.isArray(block.words)) {
            next.words = block.words.map(w => ({ ...w, text: doCase(doRmPunct(w.text || '')) }));
        }
        return next;
    });
}

// ----------------------------------------------------------------- Deliver
// Phrase-level structural ops used by the Deliver Grouping mode. These keep the
// `words` arrays intact so per-word timing / emphasis survives the operation.

// Merge a phrase block with the one directly below it (Deliver: arrow points
// DOWN, the selected phrase joins its lower neighbour).
function joinPhraseText(parts) {
    return parts.reduce((out, part) => {
        const text = String(part || '').trim();
        if (!text) return out;
        if (!out) return text;
        const leftBoundary = [...out].at(-1) || '';
        const rightBoundary = [...text][0] || '';
        const separator = UNSPACED_SCRIPT.test(leftBoundary) && UNSPACED_SCRIPT.test(rightBoundary) ? '' : ' ';
        return out + separator + text;
    }, '');
}

export function mergePhraseDown(blocks, index) {
    if (index < 0 || index >= blocks.length - 1) return blocks;
    const a = blocks[index];
    const b = blocks[index + 1];
    const merged = {
        ...a,
        end: b.end,
        text: joinPhraseText([a.text, b.text]),
        words: [...(a.words || []), ...(b.words || [])]
    };
    const next = [...blocks];
    next.splice(index, 2, merged);
    return next;
}

// Split a phrase block at a word boundary. `wordIndex` is the index of the first
// word that moves to the NEW (lower) block — the tail goes down, the head stays.
export function splitPhraseAtWord(blocks, index, wordIndex) {
    const b = blocks[index];
    const words = b.words || [];
    if (wordIndex <= 0 || wordIndex >= words.length) return blocks;

    const headWords = words.slice(0, wordIndex);
    const tailWords = words.slice(wordIndex);
    if (!headWords.length || !tailWords.length) return blocks;

    const joinText = (ws) => joinPhraseText(ws.map(w => w.text));
    const head = {
        ...b,
        end: headWords[headWords.length - 1].end,
        text: joinText(headWords),
        words: headWords
    };
    const tail = {
        ...b,
        __uid: undefined, // caller stamps a fresh uid
        start: tailWords[0].start,
        text: joinText(tailWords),
        words: tailWords
    };
    const next = [...blocks];
    next.splice(index, 1, head, tail);
    return next;
}

// Scripts written without spaces between words. Splitting on /\s+/ turns a whole
// Japanese/Chinese line into ONE token, so every grouping mode returned the input
// unchanged; Intl.Segmenter finds the real boundaries inside these runs.
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

const HAS_LETTER = /[\p{L}\p{N}]/u;

// Opening brackets/quotes belong to the token they OPEN. Without this they glue
// onto the preceding token whenever no space separates them, so a Japanese line
// breaks as 'は「' + '天気」' and a caption can end on a dangling 「.
const OPENING_PUNCT = /^[「『（〔【〈《"'“‘«([{]+$/u;

const wordSegmenter = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
    ? new Intl.Segmenter(undefined, { granularity: 'word' })
    : null;

// Split text into words, each tagged with whether whitespace preceded it in the
// SOURCE. Joining must reproduce exactly those spaces — a space invented between
// two CJK words would be written into the Resolve caption.
function segmentWords(text) {
    const src = String(text || '');
    if (!src.trim()) return [];

    if (!wordSegmenter) {
        // Degraded path (no Intl.Segmenter): whitespace still separates words in
        // spaced scripts, but an unspaced run has no boundary we can find without
        // a dictionary, so per-character is the least-wrong split there.
        const words = [];
        src.trim().split(/\s+/).filter(Boolean).forEach((token, i) => {
            if (UNSPACED_SCRIPT.test(token)) {
                let spacedRun = '';
                let first = true;
                const push = (text) => {
                    if (!text) return;
                    words.push({ text, space: i > 0 && first });
                    first = false;
                };
                for (const ch of token) {
                    if (UNSPACED_SCRIPT.test(ch)) {
                        push(spacedRun);
                        spacedRun = '';
                        push(ch);
                    } else {
                        spacedRun += ch;
                    }
                }
                push(spacedRun);
            } else {
                words.push({ text: token, space: i > 0 });
            }
        });
        return words;
    }

    const words = [];
    let pendingSpace = false;
    for (const { segment, isWordLike } of wordSegmenter.segment(src)) {
        if (!segment.trim()) { pendingSpace = words.length > 0; continue; }
        const current = words.length ? words[words.length - 1] : null;
        // Punctuation never opens a word of its own — it rides along with the
        // token it touches so 'world.' / '天気。' keep their sentence ender, and
        // so '"hello' / '「今日' / 'e-mail' stay one token like the old split.
        // A boundary between two word-like segments only exists when one side is
        // an unspaced script; otherwise ICU is splitting inside a spaced word.
        const startNew = !current || pendingSpace
            || OPENING_PUNCT.test(segment)
            || (isWordLike && HAS_LETTER.test(current.text)
                && (UNSPACED_SCRIPT.test(current.text) || UNSPACED_SCRIPT.test(segment)));
        if (startNew) words.push({ text: segment, space: pendingSpace });
        else current.text += segment;
        pendingSpace = false;
    }
    return words;
}

// Build a per-word timed stream from subtitle blocks.
function buildWordStream(blocks) {
    const stream = [];
    for (const block of blocks) {
        const text = String(block.text || '').trim();
        if (!text) continue;

        const startMs = tcToMs(block.start);
        const endMs = tcToMs(block.end);
        const words = segmentWords(text);
        if (!words.length) continue;

        // A block boundary reads as a space in spaced scripts, but consecutive
        // CJK blocks run straight into each other with nothing between them.
        const prevText = stream.length ? stream[stream.length - 1].text : '';
        words[0].space = stream.length > 0
            && !(UNSPACED_SCRIPT.test(prevText) && UNSPACED_SCRIPT.test(words[0].text));

        // If block contains only one word, keep it as-is with exact timing
        if (words.length === 1) {
            stream.push({ text: text, space: words[0].space, start: startMs, end: endMs });
            continue;
        }

        // If block contains multiple words, split them with proportional timing.
        // Reserve the inter-word gaps out of the budget first, so the words plus
        // gaps fill exactly [startMs, endMs] and the last word never overruns.
        const totalDur = endMs - startMs;
        const totalChars = words.reduce((sum, w) => sum + w.text.length, 0);
        const gapCount = words.length - 1;
        const gapUnit = (totalChars && gapCount) ? totalDur * (1 / (totalChars + words.length)) : 0;
        const wordBudget = Math.max(0, totalDur - gapUnit * gapCount);
        let current = startMs;
        words.forEach((word, i) => {
            const wDur = totalChars ? wordBudget * (word.text.length / totalChars) : 0;
            stream.push({ text: word.text, space: word.space, start: current, end: Math.min(current + wDur, endMs) });
            current += wDur + (i < words.length - 1 ? gapUnit : 0);
        });
    }
    return stream;
}

// Counts visible characters, not UTF-16 code units — otherwise a single
// emoji (2 units) or any supplementary-plane char would consume the budget
// as if it were two characters.
const charLen = (s) => [...String(s || '')].length;

// Re-join words, restoring only the spaces the source actually had.
const joinWords = (words) => words.reduce((acc, w, i) => acc + (i && w.space ? ' ' : '') + w.text, '');

// Wrap words into lines no longer than maxChars (used by Whole Sentence mode).
// Returns the lines so callers can also count them.
function wrapLines(words, maxChars) {
    const lines = [];
    let line = [];
    let len = 0;
    for (const word of words) {
        const wl = charLen(word.text);
        const sep = (line.length && word.space) ? 1 : 0;
        if (!line.length) { line = [word]; len = wl; }
        else if (len + sep + wl <= maxChars) { line.push(word); len += sep + wl; }
        else { lines.push(joinWords(line)); line = [word]; len = wl; }
    }
    if (line.length) lines.push(joinWords(line));
    return lines;
}

// Whole Sentence caps. Resolve's transcription leaves only ~100-125 ms between
// words, so the gap rule almost never fires: unpunctuated speech grew into a
// single caption of 6-10 lines lasting 10+ seconds. Both caps break at a word
// boundary, so anything that already fits is untouched.
const WS_MAX_LINES = 2;
const WS_MAX_DURATION_MS = 6000;
// How far ahead to look for the end of the current sentence before letting a
// size cap break the phrase. Generous on purpose: a complete sentence always
// beats a tidy one, and the caps are only meant to catch genuinely
// unpunctuated speech.
const WS_LOOKAHEAD_WORDS = 60;

// mode: 0=Single Word, 1=Whole Sentence, 2=Custom
export function smartRegroupSubs(blocks, mode, maxWords, maxChars, {
    maxGapMs = 800,
    wsMaxChars = 18,
    wsMaxLines = WS_MAX_LINES,
    wsMaxDurationMs = WS_MAX_DURATION_MS
} = {}) {
    const stream = buildWordStream(blocks);

    const formatPhrase = (words) => {
        if (mode === 1) return wrapLines(words, wsMaxChars).join('\n');
        return joinWords(words);
    };

    const result = [];
    let phrase = [];
    let start = null;
    let end = null;

    const flush = () => {
        result.push({
            idx: result.length + 1,
            start: msToTc(start),
            end: msToTc(end),
            text: formatPhrase(phrase),
            words: phrase.map(w => ({ text: w.text, start: msToTc(w.start), end: msToTc(w.end) }))
        });
    };

    const wordEndsSentence = (word) =>
        SENTENCE_ENDERS.has(word.text.replace(TRAILING_QUOTES, '').slice(-1));

    // Is the sentence in progress going to finish soon? Whole Sentence must
    // never cut a sentence in half, so the size caps below only fire once the
    // stream shows no terminator ahead — i.e. the speaker really is running on
    // without punctuation, which is the case the caps exist for.
    const terminatorAhead = (from) => {
        const limit = Math.min(stream.length, from + WS_LOOKAHEAD_WORDS);
        for (let j = from; j < limit; j++) {
            if (wordEndsSentence(stream[j])) return true;
        }
        return false;
    };

    for (let i = 0; i < stream.length; i++) {
        const w = stream[i];
        if (!phrase.length) {
            phrase = [w]; start = w.start; end = w.end;
            continue;
        }
        const testPhrase = [...phrase, w];
        const gap = w.start - end;
        const endsSentence = wordEndsSentence(phrase[phrase.length - 1]);

        let shouldBreak;
        if (mode === 0) shouldBreak = true;
        else if (mode === 1) {
            const overSize = (w.end - start) > wsMaxDurationMs
                || wrapLines(testPhrase, wsMaxChars).length > wsMaxLines;
            shouldBreak = gap > maxGapMs || endsSentence
                || (overSize && !terminatorAhead(i));
        } else {
            shouldBreak = gap > maxGapMs || testPhrase.length > maxWords
                || charLen(joinWords(testPhrase)) > maxChars || endsSentence;
        }

        if (shouldBreak) {
            flush();
            phrase = [w]; start = w.start; end = w.end;
        } else {
            phrase.push(w); end = w.end;
        }
    }
    if (phrase.length) flush();
    return result;
}
