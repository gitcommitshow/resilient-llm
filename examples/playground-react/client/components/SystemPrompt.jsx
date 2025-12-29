/**
 * System Prompt Component - collapsible system prompt editor
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';

export function SystemPrompt() {
    const { messages, setSystemPrompt, editingMessageId, setEditingMessageId } = useApp();
    const [expanded, setExpanded] = useState(false);
    const [text, setText] = useState('');
    const textareaRef = useRef();
    const textRef = useRef(text);
    const wasEditingRef = useRef(false);
    
    const isEditing = editingMessageId === 'system-prompt';
    const systemMsg = messages.find(m => m.role === 'system');
    const preview = systemMsg?.text?.slice(0, 50) + (systemMsg?.text?.length > 50 ? '...' : '') || '';

    // Keep ref in sync
    useEffect(() => {
        textRef.current = text;
    }, [text]);

    useEffect(() => {
        if (systemMsg) setText(systemMsg.text || '');
    }, [systemMsg?.text]);

    // Save when editingMessageId changes away (click outside)
    useEffect(() => {
        if (wasEditingRef.current && !isEditing) {
            setSystemPrompt(textRef.current);
        }
        wasEditingRef.current = isEditing;
    }, [isEditing, setSystemPrompt]);

    const handleSave = () => {
        setSystemPrompt(text);
        setEditingMessageId(null);
    };

    const startEdit = () => {
        setText(systemMsg?.text || '');
        setEditingMessageId('system-prompt');
        setExpanded(true);
    };

    return (
        <div className="system-prompt-pinned">
            <div 
                className="system-prompt-pinned-header" 
                onClick={() => isEditing ? null : setExpanded(!expanded)}
            >
                <div className="system-prompt-pinned-header-left">
                    <span className="system-prompt-pinned-label">System Prompt</span>
                    {!expanded && <span className="system-prompt-preview">{preview}</span>}
                </div>
                <span className="system-prompt-pinned-toggle">{expanded ? '▲' : '▼'}</span>
            </div>
            {expanded && (
                <div className="system-prompt-pinned-content" style={{ display: 'block' }}>
                    {isEditing ? (
                        <div>
                            <textarea
                                ref={textareaRef}
                                className="system-prompt-input-field"
                                value={text}
                                onChange={e => setText(e.target.value)}
                                placeholder="Enter system prompt..."
                                autoFocus
                                rows={4}
                            />
                            <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                                <button className="secondary-button" onClick={() => { setText(systemMsg?.text || ''); setEditingMessageId(null); }}>
                                    Cancel
                                </button>
                                <button className="primary-button" onClick={handleSave}>Save</button>
                            </div>
                        </div>
                    ) : (
                        <div 
                            className="system-prompt-pinned-display" 
                            onClick={startEdit}
                            style={{ cursor: 'pointer' }}
                        >
                            {systemMsg?.text || <em style={{ color: '#999' }}>Click to add system prompt...</em>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
