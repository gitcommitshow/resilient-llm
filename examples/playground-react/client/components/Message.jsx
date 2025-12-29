/**
 * Message Component - individual chat message
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { formatTime, renderMarkdown } from '../utils';

export function JsonView({ text }) {
    try {
        const parsed = JSON.parse(text);
        return (
            <div className="json-message-container">
                <div className="json-message-toolbar"><span>JSON view</span></div>
                <pre className="json-message-body">{JSON.stringify(parsed, null, 2)}</pre>
            </div>
        );
    } catch {
        return (
            <div className="json-message-container">
                <div className="json-message-toolbar"><span>JSON view</span></div>
                <div className="json-message-error">Response is not valid JSON. Showing raw output.</div>
                <pre className="json-message-body">{text}</pre>
            </div>
        );
    }
}

export function Message({ message, responseMode }) {
    const { editMessage, deleteMessage, branchAtMessage, editingMessageId, setEditingMessageId } = useApp();
    const [editText, setEditText] = useState(message.text);
    const textareaRef = useRef();
    const editTextRef = useRef(editText);
    const wasEditingRef = useRef(false);
    const isEditing = editingMessageId === message.id;

    // Keep ref in sync with state
    useEffect(() => {
        editTextRef.current = editText;
    }, [editText]);

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [isEditing]);

    // Save edit when editingMessageId changes away from this message (click outside)
    useEffect(() => {
        if (wasEditingRef.current && !isEditing) {
            const currentText = editTextRef.current;
            if (currentText.trim() !== message.text) {
                editMessage(message.id, currentText.trim());
            }
        }
        wasEditingRef.current = isEditing;
    }, [isEditing, message.id, message.text, editMessage]);

    const handleSave = () => {
        if (editText.trim() !== message.text) {
            editMessage(message.id, editText.trim());
        } else {
            setEditingMessageId(null);
        }
    };

    const startEdit = () => {
        setEditText(message.text);
        setEditingMessageId(message.id);
    };

    const isJson = message.role === 'assistant' && responseMode === 'json';

    return (
        <div className={`message ${message.role} ${isEditing ? 'editing' : ''}`}>
            <div className="message-avatar">{message.role === 'user' ? 'U' : 'AI'}</div>
            <div className={`message-content ${isEditing ? 'message-content-editing' : ''}`}>
                {isEditing ? (
                    <textarea
                        ref={textareaRef}
                        className="message-edit-textarea"
                        value={editText}
                        onChange={e => setEditText(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                            if (e.key === 'Escape') setEditingMessageId(null);
                        }}
                        rows={3}
                    />
                ) : (
                    <>
                        <div className="message-text" onClick={startEdit} style={{ cursor: 'pointer' }}>
                            {isJson ? (
                                <JsonView text={message.text} />
                            ) : (
                                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text) }} />
                            )}
                        </div>
                        <div className="message-actions">
                            <button 
                                className="message-action-btn" 
                                title="Branch from here"
                                onClick={() => branchAtMessage(message.id)}
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M4 3V8M4 8C4 9.10457 4.89543 10 6 10H8M4 8C4 9.10457 3.10457 10 2 10M10 10V8C10 6.89543 9.10457 6 8 6H6M10 10L12 8M10 10L8 8" 
                                        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                            <button 
                                className="message-action-btn" 
                                title="Delete message"
                                onClick={() => deleteMessage(message.id)}
                            >
                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" 
                                        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </button>
                        </div>
                    </>
                )}
                <div className="message-footer">
                    <div className="message-timestamp">{formatTime(message.timestamp)}</div>
                </div>
            </div>
        </div>
    );
}
