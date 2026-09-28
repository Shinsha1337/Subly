import { describe, it, expect, vi } from 'vitest';
import * as subtitle from '../src/logic/subtitle.js';
import {
    tcToMs,
    msToTc,
    wordsToChars,
    syncWordsToText,
    applyFormatting,
    smartRegroupSubs,
    mergePhraseDown,
    splitPhraseAtWord
} from '../src/logic/subtitle.js';

const W = (text, start, end) => ({ text, start, end });
const phrase = (text, start, end, words) => ({ text, start, end, words });

describe('timecode conversion', () => {
    it('parses comma and dot millisecond separators', () => {
        expect(tcToMs('00:00:01,500')).toBe(1500);
        expect(tcToMs('00:00:01.500')).toBe(1500);
        expect(tcToMs('01:02:03,004')).toBe(((1 * 3600 + 2 * 60 + 3) * 1000) + 4);
    });

    it('round-trips ms -> tc -> ms', () => {
        for (const ms of [0, 1, 999, 1500, 3661004]) {
            expect(tcToMs(msToTc(ms))).toBe(ms);
        }
    });

    it('clamps negative ms to zero', () => {
        expect(msToTc(-5)).toBe('00:00:00,000');
    });

    it('normalizes user-entered timecodes and rejects malformed fields', () => {
        expect(subtitle.normalizeTimecode('1:2:3.4')).toBe('01:02:03,400');
        expect(subtitle.normalizeTimecode('00:59:59.999')).toBe('00:59:59,999');
        expect(subtitle.normalizeTimecode('00:60:00,000')).toBeNull();
        expect(subtitle.normalizeTimecode('00:00:01,000 junk')).toBeNull();
        expect(subtitle.normalizeTimecode('not a timecode')).toBeNull();
    });

    it('rejects an inverted or zero-length time range', () => {
        expect(subtitle.isValidTimeRange('00:00:01,000', '00:00:02,000')).toBe(true);
        expect(subtitle.isValidTimeRange('00:00:02,000', '00:00:01,000')).toBe(false);
        expect(subtitle.isValidTimeRange('00:00:01,000', '00:00:01,000')).toBe(false);
        expect(subtitle.isValidTimeRange('bad', '00:00:01,000')).toBe(false);
    });
});

describe('wordsToChars', () => {
    it('maps 1..8 words into the 6..50 char range and clamps out-of-range input', () => {
        expect(wordsToChars(1)).toBe(6);
        expect(wordsToChars(8)).toBe(50);
        expect(wordsToChars(0)).toBe(6);    // clamped up to 1
        expect(wordsToChars(100)).toBe(50); // clamped down to 8
    });
});

describe('syncWordsToText', () => {
    it('keeps existing word timing when only the word text changes', () => {
        const words = syncWordsToText({
            start: '00:00:00,000',
            end: '00:00:02,000',
            words: [
                { text: 'old', start: '00:00:00,000', end: '00:00:01,000' },
                { text: 'text', start: '00:00:01,000', end: '00:00:02,000' }
            ]
        }, 'new words');

        expect(words.map(w => w.text)).toEqual(['new', 'words']);
        expect(words[0].start).toBe('00:00:00,000');
        expect(words[1].end).toBe('00:00:02,000');
    });

    it('retimes words inside the block when word count changes', () => {
        const words = syncWordsToText({
            start: '00:00:10,000',
            end: '00:00:12,000',
            words: [{ text: 'old', start: '00:00:10,000', end: '00:00:12,000' }]
        }, 'three new words');

        expect(words.map(w => w.text)).toEqual(['three', 'new', 'words']);
        expect(tcToMs(words[0].start)).toBe(10000);
        expect(tcToMs(words.at(-1).end)).toBeLessThanOrEqual(12000);
        for (let i = 1; i < words.length; i++) {
            expect(tcToMs(words[i].start)).toBeGreaterThanOrEqual(tcToMs(words[i - 1].end));
        }
    });

    // Regression: this splits on every keystroke in the Deliver editor. A plain
    // /\s+/ split collapsed an edited CJK phrase into a single "word", throwing
    // away the per-word timing and emphasis the grouping had just produced.
    it('segments CJK edits instead of collapsing them into one word', () => {
        const words = syncWordsToText({
            start: '00:00:00,000',
            end: '00:00:03,000',
            words: [
                { text: '今日', start: '00:00:00,000', end: '00:00:01,500' },
                { text: 'は', start: '00:00:01,500', end: '00:00:03,000' }
            ]
        }, '今日はいい天気');

        expect(words.length).toBeGreaterThan(1);
        expect(words.map(w => w.text).join('')).toBe('今日はいい天気');
        expect(words.every(w => !/\s/.test(w.text))).toBe(true);
        expect(tcToMs(words.at(-1).end)).toBeLessThanOrEqual(3000);
    });
});

describe('applyFormatting — case', () => {
    it('lowercases / uppercases', () => {
        expect(applyFormatting([{ text: 'Hello World' }], { text_case: 'lowercase' })[0].text).toBe('hello world');
        expect(applyFormatting([{ text: 'Hello World' }], { text_case: 'UPPERCASE' })[0].text).toBe('HELLO WORLD');
    });

    it('Auto capitalizes the first letter after a sentence ender', () => {
        expect(applyFormatting([{ text: 'hello. world' }], { text_case: 'Auto' })[0].text).toBe('Hello. World');
    });

    it('handles Cyrillic in Auto case', () => {
        expect(applyFormatting([{ text: 'привет. мир' }], { text_case: 'Auto' })[0].text).toBe('Привет. Мир');
    });

    // Regression: an ASCII+Cyrillic letter class let accented starts fall
    // through and capitalized the SECOND letter (über -> üBer, ça -> çA).
    it('Auto capitalizes accented Latin sentence starts', () => {
        expect(applyFormatting([{ text: 'über alles. étude finie' }], { text_case: 'Auto' })[0].text)
            .toBe('Über alles. Étude finie');
        expect(applyFormatting([{ text: 'ça va. école ouverte' }], { text_case: 'Auto' })[0].text)
            .toBe('Ça va. École ouverte');
    });

    it('Auto skips non-letters and capitalizes the first real letter', () => {
        expect(applyFormatting([{ text: '123 abc. — def' }], { text_case: 'Auto' })[0].text)
            .toBe('123 Abc. — Def');
    });
});

describe('applyFormatting — punctuation', () => {
    it('removes all punctuation but keeps accented Latin letters (regression: café -> caf)', () => {
        const out = applyFormatting(
            [{ text: 'Café, über!' }],
            { text_case: 'lowercase', remove_punct: true, punct_chars: 'all' }
        )[0].text;
        expect(out).toBe('café über');
    });

    it('keeps Cyrillic and digits while stripping punctuation', () => {
        const out = applyFormatting(
            [{ text: 'Привет, мир 2026!' }],
            { text_case: 'lowercase', remove_punct: true, punct_chars: 'all' }
        )[0].text;
        expect(out).toBe('привет мир 2026');
    });

    it('removes only the selected characters', () => {
        const out = applyFormatting(
            [{ text: 'a, b! c.' }],
            { text_case: 'lowercase', remove_punct: true, punct_chars: ',!' }
        )[0].text;
        expect(out).toBe('a b c.');
    });

    it('formats the per-word array too', () => {
        const out = applyFormatting(
            [{ text: 'hi!', words: [{ text: 'hi!' }] }],
            { text_case: 'UPPERCASE', remove_punct: true, punct_chars: 'all' }
        )[0];
        expect(out.words[0].text).toBe('HI');
    });
});

describe('smartRegroupSubs', () => {
    const block = (start, end, text) => ({ start, end, text });

    it('returns an empty array for empty input', () => {
        expect(smartRegroupSubs([], 0, 1, 6, {})).toEqual([]);
    });

    it('mode 0 (single word) emits one phrase per word', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:02,000', 'one two three')], 0, 1, 6, {});
        expect(res.map(r => r.text)).toEqual(['one', 'two', 'three']);
    });

    it('mode 1 (whole sentence) breaks on a sentence ender', () => {
        const res = smartRegroupSubs([
            block('00:00:00,000', '00:00:01,000', 'hello world.'),
            block('00:00:01,100', '00:00:02,000', 'next one')
        ], 1, 1, 6, { wsMaxChars: 18 });
        expect(res.length).toBe(2);
        expect(res[0].text).toBe('hello world.');
        expect(res[1].text).toBe('next one');
    });

    it('mode 1 wraps by character count, not UTF-16 code units (emoji regression)', () => {
        // Each emoji is 1 char but 2 UTF-16 units (surrogate pair). With the
        // old word.length, '🌟🌟🌟' looked like 6 units and refused to share
        // a 6-unit line with 'ха'. With charLen it is 3 chars and fits.
        const res = smartRegroupSubs([
            block('00:00:00,000', '00:00:01,000', '🌟🌟🌟 ха'),
        ], 1, 1, 6, { wsMaxChars: 6 });
        expect(res.length).toBe(1);
        expect(res[0].text).toBe('🌟🌟🌟 ха');
    });

    it('mode 2 (custom) respects the max word count', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', 'a b c d e')], 2, 2, 100, {});
        // 5 words, max 2 per phrase -> 3 phrases (2 + 2 + 1)
        expect(res.length).toBe(3);
        expect(res[0].text.split(' ').length).toBeLessThanOrEqual(2);
    });

    it('word timing never overruns the block end (regression)', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:01,000', 'aaaa bb c')], 2, 10, 100, {});
        expect(res.length).toBe(1);
        const words = res[0].words;
        for (const w of words) {
            expect(tcToMs(w.end)).toBeLessThanOrEqual(1000);
            expect(tcToMs(w.start)).toBeGreaterThanOrEqual(0);
        }
        expect(tcToMs(res[0].end)).toBeLessThanOrEqual(1000);
    });

    it('keeps words in chronological, non-overlapping order', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:03,000', 'one two three four')], 2, 10, 100, {});
        const words = res[0].words;
        for (let i = 1; i < words.length; i++) {
            expect(tcToMs(words[i].start)).toBeGreaterThanOrEqual(tcToMs(words[i - 1].start));
        }
    });
});

// Segmentation assertions stay ICU-version agnostic: the exact tokens a
// dictionary picks may shift between Node/Electron builds, so we assert the
// invariants instead (round-trip, no invented spaces, phrase counts).
describe('smartRegroupSubs — CJK segmentation', () => {
    const block = (start, end, text) => ({ start, end, text });
    const JA = '今日はいい天気ですね本当に気持ちがいいです';
    const ZH = '我们今天去公园玩得很开心真的很棒';

    it('mode 0 splits Japanese into several words (was one token)', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', JA)], 0, 1, 6, {});
        expect(res.length).toBeGreaterThan(1);
        expect(res.map(r => r.text).join('')).toBe(JA);
    });

    it('mode 0 splits Chinese into several words (was one token)', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', ZH)], 0, 1, 6, {});
        expect(res.length).toBeGreaterThan(1);
        expect(res.map(r => r.text).join('')).toBe(ZH);
    });

    it('mode 2 honours the word cap on Chinese and never invents a space', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', ZH)], 2, 2, 100, {});
        expect(res.length).toBeGreaterThan(1);
        for (const r of res) {
            expect(r.words.length).toBeLessThanOrEqual(2);
            expect(r.text).not.toMatch(/\s/);
        }
        expect(res.map(r => r.text).join('')).toBe(ZH);
    });

    it('mode 1 wraps Japanese into lines without inserting spaces', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', JA)], 1, 1, 6, { wsMaxChars: 18 });
        expect(res).toHaveLength(1);
        const lines = res[0].text.split('\n');
        expect(lines.length).toBeLessThanOrEqual(2);
        for (const line of lines) expect([...line].length).toBeLessThanOrEqual(18);
        expect(res[0].text.replace(/\n/g, '')).toBe(JA);
        expect(res[0].text).not.toMatch(/ /);
    });

    it('mode 1 keeps a short Chinese line on one line, unchanged', () => {
        const res = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', ZH)], 1, 1, 6, { wsMaxChars: 18 });
        expect(res).toHaveLength(1);
        expect(res[0].text).toBe(ZH);
    });

    // A block boundary is a space in English but nothing at all in Japanese —
    // joining with ' ' would write a space that was never spoken into Resolve.
    it('does not put a space between two merged CJK blocks', () => {
        const res = smartRegroupSubs([
            block('00:00:00,000', '00:00:02,000', '今日はいい天気ですね'),
            block('00:00:02,100', '00:00:04,000', '本当に気持ちがいいです')
        ], 1, 1, 6, { wsMaxChars: 60 });
        expect(res).toHaveLength(1);
        expect(res[0].text).toBe(JA);
    });

    it('still puts a space between two merged Latin blocks', () => {
        const res = smartRegroupSubs([
            block('00:00:00,000', '00:00:01,000', 'hello there'),
            block('00:00:01,100', '00:00:02,000', 'my friend')
        ], 1, 1, 6, { wsMaxChars: 60 });
        expect(res).toHaveLength(1);
        expect(res[0].text).toBe('hello there my friend');
    });

    it('breaks on the full-width terminators 。！？', () => {
        const dot = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', '今日は雨。明日は晴れ')], 1, 1, 6, { wsMaxChars: 60 });
        expect(dot.map(r => r.text)).toEqual(['今日は雨。', '明日は晴れ']);

        const bang = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', 'すごい！本当に')], 1, 1, 6, { wsMaxChars: 60 });
        expect(bang.map(r => r.text)).toEqual(['すごい！', '本当に']);

        const ask = smartRegroupSubs([block('00:00:00,000', '00:00:04,000', '本当？そうです')], 1, 1, 6, { wsMaxChars: 60 });
        expect(ask.map(r => r.text)).toEqual(['本当？', 'そうです']);
    });

    // Regression: the quote-strip class missed ’ ) ] so a terminator hidden
    // behind them was never seen as a sentence end.
    it('sees a sentence end behind a closing ’ ) or ]', () => {
        for (const closer of ['’', ')', ']']) {
            const res = smartRegroupSubs(
                [block('00:00:00,000', '00:00:02,000', `done.${closer} next`)], 1, 1, 6, { wsMaxChars: 60 });
            expect(res.map(r => r.text)).toEqual([`done.${closer}`, 'next']);
        }
    });

    // A CJK opening bracket must ride along with the word it opens instead of
    // becoming a caption that reads just '「'.
    it('keeps CJK brackets attached and still sees the terminator inside them', () => {
        const res = smartRegroupSubs(
            [block('00:00:00,000', '00:00:04,000', '「今日は雨。」明日は晴れ')], 1, 1, 6, { wsMaxChars: 60 });
        expect(res.map(r => r.text)).toEqual(['「今日は雨。」', '明日は晴れ']);
        expect(res[0].words[0].text.startsWith('「')).toBe(true);
    });

    it('degrades to per-character splitting for CJK without Intl.Segmenter', async () => {
        const real = Intl.Segmenter;
        delete Intl.Segmenter;
        try {
            vi.resetModules();
            const mod = await import('../src/logic/subtitle.js');
            const res = mod.smartRegroupSubs([block('00:00:00,000', '00:00:04,000', '今日はいい')], 0, 1, 6, {});
            expect(res.map(r => r.text)).toEqual(['今', '日', 'は', 'い', 'い']);
            // Spaced scripts must NOT be shredded by the fallback.
            const en = mod.smartRegroupSubs([block('00:00:00,000', '00:00:04,000', 'hello there')], 0, 1, 6, {});
            expect(en.map(r => r.text)).toEqual(['hello', 'there']);

            const mixed = mod.smartRegroupSubs([block('00:00:00,000', '00:00:04,000', 'Hello世界')], 0, 1, 6, {});
            expect(mixed.map(r => r.text)).toEqual(['Hello', '世', '界']);
        } finally {
            Intl.Segmenter = real;
            vi.resetModules();
        }
    });

    // Regression: an opening bracket with no space before it glued onto the
    // PRECEDING token, so a phrase could end on a dangling 「.
    it('opening brackets start the token they open, not close the previous one', () => {
        const res = smartRegroupSubs(
            [block('00:00:01,000', '00:00:05,000', '今日は「天気」です')], 0, 1, 6, {}
        );
        expect(res.map(r => r.text).join('')).toBe('今日は「天気」です');
        expect(res.some(r => r.text.endsWith('「'))).toBe(false);
        expect(res.some(r => r.text.includes('「天気'))).toBe(true);
    });

    it('leaves Latin quoting, hyphenation and decimals as single tokens', () => {
        const res = smartRegroupSubs(
            [block('00:00:01,000', '00:00:06,000', 'he said "hello, send e-mail about 3.14')],
            0, 1, 6, {}
        );
        const texts = res.map(r => r.text);
        expect(texts).toContain('"hello,');
        expect(texts).toContain('e-mail');
        expect(texts).toContain('3.14');
    });
});

describe('smartRegroupSubs — Whole Sentence length caps', () => {
    const msTc = (ms) => {
        const p = (n, w = 2) => String(n).padStart(w, '0');
        return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
    };
    // One block per word with a ~110 ms gap — what Resolve's transcription
    // actually emits, which is why the 800 ms gap rule almost never fires.
    const speech = (text, wordMs = 290, gapMs = 110) => text.split(' ').map((w, i) => ({
        start: msTc(i * (wordMs + gapMs)),
        end: msTc(i * (wordMs + gapMs) + wordMs),
        text: w
    }));
    const blocks = speech('so then we went down to the river and looked at the boats for a while');

    it('caps an unpunctuated run at 2 wrapped lines', () => {
        const res = smartRegroupSubs(blocks, 1, 1, 6, { wsMaxChars: 18 });
        expect(res.length).toBeGreaterThan(1);
        for (const r of res) {
            const lines = r.text.split('\n');
            expect(lines.length).toBeLessThanOrEqual(2);
            for (const line of lines) expect([...line].length).toBeLessThanOrEqual(18);
        }
        expect(res.map(r => r.text.replace(/\n/g, ' ')).join(' '))
            .toBe(blocks.map(b => b.text).join(' '));
    });

    // Regression: the caps used to fire unconditionally and could cut a
    // punctuated sentence in half ("…отравляет тело" + "женщин."). Whole
    // Sentence must never do that — the caps only exist for run-on speech.
    it('never splits a sentence that is longer than the caps', () => {
        const sentence = 'Но к несчастью, яд, который там содержится, отравляет тело женщин.';
        const res = smartRegroupSubs(speech(sentence), 1, 1, 6, { wsMaxChars: 30 });
        expect(res.length).toBe(1);
        expect(res[0].text.replace(/\n/g, ' ')).toBe(sentence);
    });

    it('still breaks between two complete sentences', () => {
        const res = smartRegroupSubs(
            speech('Но к несчастью, яд, который там содержится, отравляет тело женщин. Говорю же тебе это проклятие!'),
            1, 1, 6, { wsMaxChars: 30 }
        );
        expect(res.length).toBe(2);
        expect(res[0].text.replace(/\n/g, ' ')).toMatch(/женщин\.$/);
        expect(res[1].text.replace(/\n/g, ' ')).toBe('Говорю же тебе это проклятие!');
    });

    it('caps an unpunctuated run at 6 seconds', () => {
        // wsMaxChars is large so only the duration cap can fire here.
        const res = smartRegroupSubs(blocks, 1, 1, 6, { wsMaxChars: 500 });
        expect(res.length).toBeGreaterThan(1);
        for (const r of res) {
            expect(tcToMs(r.end) - tcToMs(r.start)).toBeLessThanOrEqual(6000);
        }
    });

    it('breaks the caps at a word boundary, losing no words', () => {
        const res = smartRegroupSubs(blocks, 1, 1, 6, { wsMaxChars: 18 });
        expect(res.flatMap(r => r.words.map(w => w.text))).toEqual(blocks.map(b => b.text));
    });

    it('without the caps the same run is one 6+ second phrase (the old bug)', () => {
        const res = smartRegroupSubs(blocks, 1, 1, 6, { wsMaxChars: 500, wsMaxLines: 99, wsMaxDurationMs: 1e9 });
        expect(res).toHaveLength(1);
        expect(tcToMs(res[0].end) - tcToMs(res[0].start)).toBeGreaterThan(6000);
    });

    it('leaves short punctuated speech byte-identical', () => {
        const res = smartRegroupSubs(speech('hello there. how are you?'), 1, 1, 6, { wsMaxChars: 18 });
        expect(res.map(r => r.text)).toEqual(['hello there.', 'how are you?']);
    });

    it('mode 2 counts characters, not UTF-16 units (emoji budget)', () => {
        // '🌟🌟🌟 ха' is 6 characters but 9 UTF-16 units — with the old
        // testText.length it blew a 6-char budget and split.
        const one = smartRegroupSubs([{ start: '00:00:00,000', end: '00:00:01,000', text: '🌟🌟🌟 ха' }], 2, 10, 6, {});
        expect(one.map(r => r.text)).toEqual(['🌟🌟🌟 ха']);

        const two = smartRegroupSubs([{ start: '00:00:00,000', end: '00:00:01,000', text: '🌟🌟🌟 ха' }], 2, 10, 5, {});
        expect(two.map(r => r.text)).toEqual(['🌟🌟🌟', 'ха']);
    });
});

describe('Deliver grouping: mergePhraseDown', () => {
    const blocks = [
        phrase('Hello there', '00:00:00,000', '00:00:01,000', [W('Hello', '00:00:00,000', '00:00:00,500'), W('there', '00:00:00,500', '00:00:01,000')]),
        phrase('friend', '00:00:01,000', '00:00:02,000', [W('friend', '00:00:01,000', '00:00:02,000')]),
        phrase('bye', '00:00:02,000', '00:00:03,000', [W('bye', '00:00:02,000', '00:00:03,000')])
    ];

    it('joins a phrase with the one below it (text + words + end time)', () => {
        const out = mergePhraseDown(blocks, 0);
        expect(out).toHaveLength(2);
        expect(out[0].text).toBe('Hello there friend');
        expect(out[0].end).toBe('00:00:02,000');
        expect(out[0].words.map(w => w.text)).toEqual(['Hello', 'there', 'friend']);
    });

    it('is a no-op on the last block', () => {
        const out = mergePhraseDown(blocks, 2);
        expect(out).toBe(blocks);
    });

    it('does not invent spaces when merging unspaced CJK phrases', () => {
        const input = [
            phrase('今日は', '00:00:00,000', '00:00:01,000', [W('今日', '00:00:00,000', '00:00:00,500'), W('は', '00:00:00,500', '00:00:01,000')]),
            phrase('いい天気', '00:00:01,000', '00:00:02,000', [W('いい', '00:00:01,000', '00:00:01,500'), W('天気', '00:00:01,500', '00:00:02,000')])
        ];
        expect(mergePhraseDown(input, 0)[0].text).toBe('今日はいい天気');
    });

    it('preserves a required Latin-space boundary inside mixed CJK phrases', () => {
        const input = [
            phrase('東京 AI', '00:00:00,000', '00:00:01,000', [W('東京', '00:00:00,000', '00:00:00,500'), W('AI', '00:00:00,500', '00:00:01,000')]),
            phrase('model 日本', '00:00:01,000', '00:00:02,000', [W('model', '00:00:01,000', '00:00:01,500'), W('日本', '00:00:01,500', '00:00:02,000')])
        ];
        expect(mergePhraseDown(input, 0)[0].text).toBe('東京 AI model 日本');
    });
});

describe('Deliver grouping: splitPhraseAtWord', () => {
    const block = phrase('Hello there friend', '00:00:00,000', '00:00:03,000', [
        W('Hello', '00:00:00,000', '00:00:01,000'),
        W('there', '00:00:01,000', '00:00:02,000'),
        W('friend', '00:00:02,000', '00:00:03,000')
    ]);

    it('moves the tail (from wordIndex) down into a new phrase', () => {
        const out = splitPhraseAtWord([block], 0, 1);
        expect(out).toHaveLength(2);
        expect(out[0].text).toBe('Hello');
        expect(out[0].end).toBe('00:00:01,000');
        expect(out[1].text).toBe('there friend');
        expect(out[1].start).toBe('00:00:01,000');
        expect(out[1].words.map(w => w.text)).toEqual(['there', 'friend']);
    });

    it('is a no-op at boundaries (0 or last word index)', () => {
        const input = [block];
        expect(splitPhraseAtWord(input, 0, 0)).toBe(input);
        expect(splitPhraseAtWord(input, 0, 3)).toBe(input);
    });

    it('does not invent spaces when splitting an unspaced CJK phrase', () => {
        const input = [phrase('今日はいい天気', '00:00:00,000', '00:00:03,000', [
            W('今日は', '00:00:00,000', '00:00:01,000'),
            W('いい', '00:00:01,000', '00:00:02,000'),
            W('天気', '00:00:02,000', '00:00:03,000')
        ])];
        const out = splitPhraseAtWord(input, 0, 1);
        expect(out.map(b => b.text)).toEqual(['今日は', 'いい天気']);
    });
});
