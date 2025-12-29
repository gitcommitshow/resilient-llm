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
        if (systemMsg && !isEditing) setText(systemMsg.text || '');
    }, [systemMsg?.text, isEditing]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [isEditing]);

    // Save when editingMessageId changes away (click outside)
    useEffect(() => {
        if (wasEditingRef.current && !isEditing) {
            const currentText = textRef.current;
            const oldText = systemMsg?.text || '';
            if (currentText.trim() !== oldText.trim()) {
                setSystemPrompt(currentText.trim());
            }
        }
        wasEditingRef.current = isEditing;
    }, [isEditing, systemMsg?.text, setSystemPrompt]);

    const handleSave = () => {
        const oldText = systemMsg?.text || '';
        if (text.trim() !== oldText.trim()) {
            setSystemPrompt(text.trim());
        } else {
            setEditingMessageId(null);
        }
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
                        <textarea
                            ref={textareaRef}
                            className="system-prompt-input-field"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                                if (e.key === 'Escape') { setText(systemMsg?.text || ''); setEditingMessageId(null); }
                            }}
                            placeholder="Enter system prompt..."
                            autoFocus
                            rows={4}
                        />
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
