/**
 * Prompt Header Component - prompt title and save version button
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { VersionBar } from './VersionBar';
import { StatusBar } from './Header';
import { FaSave, FaEdit } from 'react-icons/fa';

export function SaveVersionButton() {
    const { saveVersion, messages } = useApp();
    const [showModal, setShowModal] = useState(false);
    const [notes, setNotes] = useState('');

    const handleSave = () => {
        saveVersion(notes);
        setNotes('');
        setShowModal(false);
    };

    const hasContent = messages.some(m => m.text?.trim());

    return (
        <>
            <button 
                className="save-version-btn" 
                onClick={() => hasContent ? setShowModal(true) : alert('Add content first')}
                tabIndex={6}
                title="Save version"
            >
                <FaSave />
                Save Version
            </button>
            {showModal && (
                <div className="modal" onClick={() => setShowModal(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header"><h3>Save as Version</h3></div>
                        <div className="modal-body">
                            <p className="modal-description">Save current conversation as an immutable version.</p>
                            <label>Notes (optional):</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="e.g., Good baseline"
                                onKeyDown={e => e.key === 'Enter' && handleSave()}
                                autoFocus
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="secondary-button" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="primary-button" onClick={handleSave}>Save Version</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export function PromptHeader() {
    const { currentPrompt, currentPromptId, renamePrompt } = useApp();
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState('');
    const inputRef = useRef();

    useEffect(() => {
        if (currentPrompt) setName(currentPrompt.name);
    }, [currentPrompt]);

    if (!currentPromptId) return null;

    const handleBlur = () => {
        setEditing(false);
        if (name.trim() && name !== currentPrompt?.name) {
            renamePrompt(currentPromptId, name);
        }
    };

    return (
        <div className="prompt-header-panel">
            <div className="prompt-title-bar">
                {editing ? (
                    <input
                        ref={inputRef}
                        className="prompt-name-display"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={e => e.key === 'Enter' && inputRef.current?.blur()}
                        tabIndex={1}
                        autoFocus
                    />
                ) : (
                    <h3 
                        className="prompt-name-display" 
                        onClick={() => setEditing(true)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setEditing(true);
                            }
                        }}
                        tabIndex={1}
                        role="button"
                        title="Click to edit"
                        aria-label="Edit prompt name"
                    >
                        <FaEdit style={{ marginRight: '6px', fontSize: '0.9em', opacity: 0.6 }} />
                        {currentPrompt?.name || 'New Prompt'}
                    </h3>
                )}
                <SaveVersionButton />
            </div>
            <VersionBar />
            <StatusBar />
        </div>
    );
}
