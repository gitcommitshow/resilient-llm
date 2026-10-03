/**
 * Message Component - individual chat message
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context';
import { renderMarkdown } from '../utils';
import { FaCopy, FaRedo, FaCodeBranch, FaTimes, FaCheck, FaBug } from 'react-icons/fa';

/**
 * Reads the function name and argument payload from a provider tool call.
 */
function readToolCall(call) {
    const name = call?.function?.name || call?.name || 'tool';
    const raw = call?.function?.arguments ?? call?.input ?? call?.arguments;
    if (raw == null || raw === '') return { name, argsText: '' };
    if (typeof raw === 'string') {
        try {
            return { name, argsText: JSON.stringify(JSON.parse(raw), null, 2) };
        } catch {
            return { name, argsText: raw };
        }
    }
    try {
        return { name, argsText: JSON.stringify(raw, null, 2) };
    } catch {
        return { name, argsText: String(raw) };
    }
}

/**
 * Shows a model tool request and asks the user to approve or deny it.
 * Approve or deny resumes the model turn through the tool call id.
 */
export function ToolCallsView({ message }) {
    const { decideToolCall, isResponding } = useApp();
    const toolCalls = message?.toolCalls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
    const approval = message.toolApproval || 'pending';
    const ran = approval !== 'failed' && toolCalls.every((call) => typeof call?.result === 'string' && call.result.trim().length > 0);
    const running = approval === 'running';
    const emptyResultCalls = approval === 'approved' && !running && !isResponding
        ? toolCalls.filter((call) => typeof call?.result !== 'string' || !call.result.trim())
        : [];
    const showApproval = approval === 'pending' || emptyResultCalls.length > 0;
    const statusLabel = approval === 'failed'
        ? 'Failed'
        : approval === 'denied'
            ? 'Denied'
            : ran
                ? 'Ran'
                : running
                    ? 'Running...'
                    : 'Needs approval';

    return (
        <div className="tool-calls">
            {toolCalls.map((call, index) => {
                const { name, argsText } = readToolCall(call);
                const result = typeof call?.result === 'string' ? call.result : '';
                return (
                    <div className={`tool-call tool-call-${approval}`} key={call?.id || `${name}-${index}`}>
                        <div className="tool-call-toolbar">
                            <span>Tool call</span>
                            <code className="tool-call-name" title={call?.id || undefined}>{name}</code>
                            <span className="tool-call-status">{statusLabel}</span>
                        </div>
                        {argsText ? <pre className="tool-call-body">{argsText}</pre> : null}
                        {result ? <pre className="tool-call-body">{result}</pre> : null}
                    </div>
                );
            })}
            {approval === 'failed' ? (
                <div className="tool-call-warning" role="alert">
                    <strong>Tool call failed.</strong> {message.toolError || 'The tool call failed.'}
                </div>
            ) : emptyResultCalls.length > 0 ? (
                <div className="tool-call-warning" role="alert">
                    <strong>Empty tool result.</strong> {emptyResultCalls.map((call) => call?.function?.name || call?.name || 'tool').join(', ')} returned no results. Approve again to run it.
                </div>
            ) : null}
            {showApproval ? (
                <div className="tool-call-approval">
                    <p>Allow this tool call?</p>
                    <div className="tool-call-approval-actions">
                        <button
                            type="button"
                            className="tool-call-approve"
                            onClick={() => decideToolCall(message.id, 'approved')}
                            disabled={isResponding}
                        >
                            Approve
                        </button>
                        <button
                            type="button"
                            className="tool-call-deny"
                            onClick={() => decideToolCall(message.id, 'denied')}
                            disabled={isResponding}
                        >
                            Deny
                        </button>
                    </div>
                </div>
            ) : approval === 'denied' ? (
                <p className="tool-call-decision">You denied this call.</p>
            ) : running ? (
                <p className="tool-call-decision">Running the tool...</p>
            ) : null}
        </div>
    );
}

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

export function Message({ message, responseFormat }) {
    const { editMessage, deleteMessage, branchAtMessage, regenerateMessage, editingMessageId, setEditingMessageId, isResponding, setSelectedActivityMessageId, setIsBackendPanelOpen } = useApp();
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
            const toolText = Array.isArray(message.toolCalls)
                ? message.toolCalls.map((call) => {
                    const { name, argsText } = readToolCall(call);
                    const result = typeof call?.result === 'string' ? call.result : '';
                    return [name, argsText, result].filter(Boolean).join('\n');
                }).join('\n\n')
                : '';
            const text = [message.text, toolText].filter(Boolean).join('\n\n');
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const isJson = message.role === 'assistant' && responseFormat === 'json';
    const hasToolCalls = Array.isArray(message.toolCalls) && message.toolCalls.length > 0;

    return (
        <div className={`message ${message.role} ${isEditing ? 'editing' : ''}`}>
            <div className="message-avatar">{message.role === 'user' ? 'U' : 'AI'}</div>
            <div className={`message-content ${isEditing ? 'message-content-editing' : ''} ${isJson ? 'message-content-json' : ''}`}>
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
                        {message.role === 'assistant' && message.metadata && message.metadata.hint && (
                            <div className="message-empty-response-hint" role="alert">
                                <strong>Empty response</strong> — {message.metadata.hint}
                            </div>
                        )}
                        {(message.text || !hasToolCalls) && (
                            <div className="message-text" onClick={startEdit} style={{ cursor: 'pointer' }}>
                                {isJson ? (
                                    <JsonView text={message.text} />
                                ) : (
                                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.text || '') }} />
                                )}
                            </div>
                        )}
                        <ToolCallsView message={message} />
                        <div className="message-actions">
                            {message.role === 'assistant' && message.metadata && message.metadata.operation && (
                                <button
                                    className="message-action-btn"
                                    title="View backend observability"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedActivityMessageId(message.id);
                                        setIsBackendPanelOpen(true);
                                    }}
                                >
                                    <FaBug />
                                </button>
                            )}
                            <button
                                className="message-copy-btn"
                                title={copied ? "Copied!" : "Copy message"}
                                onClick={handleCopy}
                            >
                                {copied ? <FaCheck /> : <FaCopy />}
                            </button>
                            {message.role === 'assistant' && (
                                <button
                                    className="message-action-btn"
                                    title="Regenerate response (with cache turned off)"
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
            </div>
        </div>
    );
}
