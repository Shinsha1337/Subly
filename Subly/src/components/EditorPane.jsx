import React from 'react';
import Editor from './Editor';

export function resetEditorHistory(history) {
    history.undo.length = 0;
    history.redo.length = 0;
    return history;
}

export default function EditorPane({
    tab,
    currentBlocks,
    setPhrasesBlocks,
    setOriginalBlocks,
    syncPlayhead,
    loadToken,
    deliverSection,
    setDeliverSection,
    phrasesTool,
    setPhrasesTool,
    emph,
    setEmph
}) {
    const transcriptionHistory = React.useRef({ undo: [], redo: [] });
    const deliverHistory = React.useRef({ undo: [], redo: [] });

    React.useEffect(() => {
        resetEditorHistory(transcriptionHistory.current);
        resetEditorHistory(deliverHistory.current);
    }, [loadToken]);

    return (
        <div className="editor-panel">
            {tab === 'template' ? (
                <div className="empty-state">
                    <div className="empty-state-title">How to create subtitles</div>
                    <div className="empty-state-desc">
                        <ol>
                            <li>Pick a <strong>Text+ template</strong> here and click <strong>Set Preview Caption</strong>.</li>
                            <li>Switch to <strong>Transcription</strong> and click <strong>Transcribe Audio</strong>, or choose an existing track and click <strong>Pull from Resolve</strong>.</li>
                            <li>Edit text or timing in the editor, and click <strong>Apply to Resolve</strong> to sync changes back.</li>
                            <li>Choose a <strong>Subtitle Mode</strong> and click <strong>Create Phrases</strong>.</li>
                            <li>Open <strong>Deliver</strong> to customize style, positioning, and per-word emphasis, then click <strong>Create Captions</strong>.</li>
                        </ol>
                    </div>
                </div>
            ) : tab === 'transcription' && currentBlocks.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-title">No subtitles loaded</div>
                    <div className="empty-state-desc">
                        <p>Click <strong>Transcribe Audio</strong> to transcribe the timeline, or choose a track and click <strong>Pull from Resolve</strong>.</p>
                    </div>
                </div>
            ) : tab === 'deliver' && currentBlocks.length === 0 ? (
                <div className="empty-state">
                    <div className="empty-state-title">No phrases yet</div>
                    <div className="empty-state-desc">
                        <p>Generate phrases on the <strong>Transcription</strong> tab first, then come back here to style, edit, and create your captions.</p>
                    </div>
                </div>
            ) : (
                <Editor
                    key={tab}
                    historyRef={tab === 'deliver' ? deliverHistory.current : transcriptionHistory.current}
                    blocks={currentBlocks}
                    setBlocks={tab === 'deliver' ? setPhrasesBlocks : setOriginalBlocks}
                    onSyncPlayhead={syncPlayhead}
                    loadToken={loadToken}
                    readOnly={false}
                    hideStructural={tab === 'transcription'}
                    edgeDelete={tab === 'transcription'}
                    countLabel={tab === 'deliver' ? 'phrases' : 'subtitles'}
                    deliverMode={tab === 'deliver'}
                    deliverSection={deliverSection}
                    setDeliverSection={setDeliverSection}
                    phrasesTool={phrasesTool}
                    setPhrasesTool={setPhrasesTool}
                    emph={emph}
                    setEmph={setEmph}
                />
            )}
        </div>
    );
}
