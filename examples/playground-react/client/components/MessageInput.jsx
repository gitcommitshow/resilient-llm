/**
 * Message Input Component - text input and send/stop button
 */
import { useState, useRef } from 'react';
import { useApp } from '../context';
import { FaPaperPlane, FaStop, FaUser, FaRobot } from 'react-icons/fa';

export function MessageInput() {
    const { sendMessage, abortRequest, senderRole, setSenderRole, isResponding } = useApp();
    const [text, setText] = useState('');
    const textareaRef = useRef();

    const handleSubmit = () => {
        if (text.trim() && !isResponding) {
            sendMessage(text, senderRole);
            setText('');
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isResponding) handleSubmit();
        }
    };

    const autoResize = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
        }
    };

    return (
        <>
            <div className="input-role-bar">
                <span className="input-role-label">Send as:</span>
                <div className="role-toggle">
                    <button 
                        className={`role-toggle-btn ${senderRole === 'user' ? 'active' : ''}`}
                        onClick={() => setSenderRole('user')}
                        title="Send as user"
                    >
                        <FaUser style={{ marginRight: '4px' }} />
                        User
                    </button>
                    <button 
                        className={`role-toggle-btn ${senderRole === 'assistant' ? 'active' : ''}`}
                        onClick={() => setSenderRole('assistant')}
                        title="Send as assistant"
                    >
                        <FaRobot style={{ marginRight: '4px' }} />
                        Assistant
                    </button>
                </div>
            </div>
            <div className="input-container">
                <div className="input-main">
                    <textarea
                        ref={textareaRef}
                        className="input-field"
                        value={text}
                        onChange={e => { setText(e.target.value); autoResize(); }}
                        onKeyDown={handleKeyDown}
                        tabIndex={5}
                        placeholder={isResponding ? 'Type your next message while waiting…' : 'Type your message...'}
                        rows={1}
                    />
                    <button
                        className={`send-button${isResponding ? ' send-button-stop' : ''}`}
                        onClick={isResponding ? abortRequest : handleSubmit}
                        disabled={!isResponding && !text.trim()}
                        title={isResponding ? 'Stop generating' : 'Send message'}
                        aria-label={isResponding ? 'Stop generating' : 'Send message'}
                    >
                        {isResponding ? <FaStop /> : <FaPaperPlane />}
                    </button>
                </div>
            </div>
        </>
    );
}
