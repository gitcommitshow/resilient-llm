/**
 * Message Component - individual chat message
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { renderMarkdown } from '../utils';
import { FaCopy, FaRedo, FaCodeBranch, FaTimes, FaCheck } from 'react-icons/fa';

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
    const { editMessage, deleteMessage, branchAtMessage, regenerateMessage, editingMessageId, setEditingMessageId, isResponding } = useApp();
    const [editText, setEditText] = useState(message.text);
    const [copied, setCopied] = useState(false);
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

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(message.text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
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
                            {message.role === 'assistant' && (
                                <button 
                                    className="message-action-btn" 
                                    title="Regenerate response"
                                    onClick={() => regenerateMessage(message.id)}
                                    disabled={isResponding}
                                >
                                    <FaRedo />
                                </button>
                            )}
                            <button 
                                className="message-action-btn" 
                                title="Branch from here"
                                onClick={() => branchAtMessage(message.id)}
                            >
                                <FaCodeBranch />
                            </button>
                            <button 
                                className="message-action-btn" 
                                title="Delete message"
                                onClick={() => deleteMessage(message.id)}
                            >
                                <FaTimes />
                            </button>
                        </div>
                    </>
                )}
                <div className="message-footer">
                    <button 
                        className="message-copy-btn" 
                        title={copied ? "Copied!" : "Copy message"}
                        onClick={handleCopy}
                    >
                        {copied ? <FaCheck /> : <FaCopy />}
                    </button>
                </div>
            </div>
        </div>
    );
}
