/**
 * System Prompt Component - collapsible system prompt editor
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';

export function SystemPrompt() {
    const { 
        messages, setSystemPrompt, editingMessageId, setEditingMessageId,
        currentPromptId, getVersions, getConversations
    } = useApp();
    const [expanded, setExpanded] = useState(false);
    const [text, setText] = useState('');
    const textareaRef = useRef();
    const textRef = useRef(text);
    const wasEditingRef = useRef(false);
    
    const isEditing = editingMessageId === 'system-prompt';
    const systemMsg = messages.find(m => m.role === 'system');
    const preview = systemMsg?.text ? (systemMsg.text.slice(0, 50) + (systemMsg.text.length > 50 ? '...' : '')) : 'None';
    const lastPromptIdRef = useRef(null);
    
    // Auto-expand and auto-start editing when prompt changes and conditions are met (no versions, no conversations with messages)
    useEffect(() => {
        if (currentPromptId !== lastPromptIdRef.current) {
            // Check if we were editing before the prompt switch
            const wasEditing = editingMessageId === 'system-prompt';
            
            // Clear any existing editing state when switching prompts
            if (wasEditing) {
                setEditingMessageId(null);
            }
            
            lastPromptIdRef.current = currentPromptId;
            
            // Check if we should auto-expand for this prompt
            const versions = currentPromptId ? getVersions(currentPromptId) : [];
            const conversations = currentPromptId ? getConversations(currentPromptId) : [];
            const hasConversationsWithMessages = conversations.some(c => (c.messages || []).length > 0);
            const shouldAutoExpand = versions.length === 0 && !hasConversationsWithMessages;
            
            // Re-evaluate focus based on new prompt's conditions
            setTimeout(() => {
                if (shouldAutoExpand) {
                    // Auto-expand and start editing for new prompt
                    setExpanded(true);
                    setText(systemMsg?.text || '');
                    setEditingMessageId('system-prompt');
                } else {
                    // Focus message input when switching to a prompt with content
                    focusMessageInput();
                }
            }, 0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPromptId]);

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
            // Focus message input when system prompt editing finishes
            focusMessageInput();
        }
        wasEditingRef.current = isEditing;
    }, [isEditing, systemMsg?.text, setSystemPrompt]);

    const handleSave = () => {
        const oldText = systemMsg?.text || '';
        if (text.trim() !== oldText.trim()) {
            setSystemPrompt(text.trim());
        }
        // Always finish editing when Enter is pressed
        setEditingMessageId(null);
        // Focus will be handled by useEffect when isEditing changes
    };

    const startEdit = () => {
        setText(systemMsg?.text || '');
        setEditingMessageId('system-prompt');
        setExpanded(true);
    };

    const focusMessageInput = () => {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const messageInput = document.querySelector('.input-field');
                if (messageInput && !messageInput.disabled) {
                    // Focus the textarea
                    messageInput.focus();
                    // Set cursor position to end to ensure cursor is visible
                    const length = messageInput.value ? messageInput.value.length : 0;
                    if (messageInput.setSelectionRange) {
                        messageInput.setSelectionRange(length, length);
                    }
                }
            });
        });
    };

    const handleEscape = () => {
        setText(systemMsg?.text || '');
        setEditingMessageId(null);
        // Focus will be handled by useEffect when isEditing changes
    };

    return (
        <div className="system-prompt-pinned">
            <div 
                className="system-prompt-pinned-header" 
                onClick={() => isEditing ? null : setExpanded(!expanded)}
                tabIndex={-1}
            >
                <div className="system-prompt-pinned-header-left">
                    <span className="system-prompt-pinned-label">System Prompt</span>
                    {!expanded && <span className="system-prompt-preview">{preview}</span>}
                </div>
                <span className="system-prompt-pinned-toggle">
                    {expanded ? <FaChevronUp /> : <FaChevronDown />}
                </span>
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
                                if (e.key === 'Escape') { e.preventDefault(); handleEscape(); }
                            }}
                            tabIndex={4}
                            placeholder="Enter system prompt..."
                            autoFocus
                            rows={4}
                        />
                    ) : (
                        <div 
                            className="system-prompt-pinned-display" 
                            onClick={startEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    startEdit();
                                }
                            }}
                            tabIndex={4}
                            role="button"
                            style={{ cursor: 'pointer' }}
                            aria-label="Edit system prompt"
                        >
                            {systemMsg?.text || <em style={{ color: '#999' }}>Click to add system prompt...</em>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
