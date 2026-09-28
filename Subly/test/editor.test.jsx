import { describe, expect, it } from 'vitest';
import * as editor from '../src/components/Editor.jsx';
import * as editorPane from '../src/components/EditorPane.jsx';

describe('editor keyboard shortcuts', () => {
    it('leaves undo and redo to editable controls', () => {
        expect(editor.isTextEditingTarget({ tagName: 'INPUT', isContentEditable: false })).toBe(true);
        expect(editor.isTextEditingTarget({ tagName: 'TEXTAREA', isContentEditable: false })).toBe(true);
        expect(editor.isTextEditingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    });

    it('handles editor shortcuts outside editable controls', () => {
        expect(editor.isTextEditingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false);
        expect(editor.isTextEditingTarget(null)).toBe(false);
    });
});

describe('editor history reset', () => {
    it('does not treat a tab remount with the same load token as a new load', () => {
        expect(editor.shouldResetEditorHistory(4, 4)).toBe(false);
        expect(editor.shouldResetEditorHistory(4, 5)).toBe(true);
    });

    it('clears both stacks without replacing the shared history container', () => {
        const history = { undo: [[{ text: 'before' }]], redo: [[{ text: 'after' }]] };
        const sameHistory = editorPane.resetEditorHistory(history);

        expect(sameHistory).toBe(history);
        expect(history).toEqual({ undo: [], redo: [] });
    });
});
