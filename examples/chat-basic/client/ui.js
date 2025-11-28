// UI Components and Interactions
// Handles typing indicators, input management, and user interactions

/**
 * Show typing indicator while waiting for AI response
 */
function showTypingIndicator(messagesContainer) {
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = 'AI';
    
    const dots = document.createElement('div');
    dots.style.display = 'flex';
    dots.style.gap = '8px';
    dots.style.alignItems = 'center';
    dots.style.padding = '12px 16px';
    dots.style.background = '#f4f4f5';
    dots.style.borderRadius = '8px';
    
    for (let i = 0; i < 3; i++) {
        const dot = document.createElement('div');
        dot.className = 'typing-dot';
        dots.appendChild(dot);
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    messageDiv.style.display = 'flex';
    messageDiv.style.alignItems = 'flex-start';
    messageDiv.style.gap = '12px';
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(dots);
    messageDiv.id = 'typingIndicator';
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom(messagesContainer);
}

/**
 * Hide typing indicator
 */
function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Auto-resize textarea based on content
 */
function autoResizeTextarea(messageInput) {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
}

