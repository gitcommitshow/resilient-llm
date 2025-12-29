/**
 * Message Input Component - text input and send button
 */
import { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';

export function MessageInput() {
    const { sendMessage, senderRole, setSenderRole, isResponding } = useApp();
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
            handleSubmit();
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
                    >User</button>
                    <button 
                        className={`role-toggle-btn ${senderRole === 'assistant' ? 'active' : ''}`}
                        onClick={() => setSenderRole('assistant')}
                    >Assistant</button>
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
                        placeholder="Type your message..."
                        disabled={isResponding}
                        rows={1}
                    />
                    <button 
                        className="send-button" 
                        onClick={handleSubmit}
                        disabled={isResponding || !text.trim()}
                        title="Send message"
                    >➤</button>
                </div>
            </div>
        </>
    );
}
