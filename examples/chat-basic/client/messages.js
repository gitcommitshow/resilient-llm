// Message Display and Management
// Handles rendering messages in the UI

/**
 * Format timestamp for display
 */
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Render markdown text as HTML
 */
function renderMarkdown(text) {
    if (typeof marked === 'undefined') {
        console.warn('Marked library not loaded, displaying plain text');
        return text;
    }
    
    try {
        return marked.parse(text);
    } catch (error) {
        console.error('Error parsing markdown:', error);
        return text;
    }
}

/**
 * Add a message to the chat UI
 * @param {string} text - Message text
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {Array} messages - Messages array (will be updated)
 * @param {HTMLElement} messagesContainer - Container element
 * @param {HTMLElement} emptyState - Empty state element
 */
function addMessage(text, role, messages, messagesContainer, emptyState) {
    const message = {
        text,
        role,
        timestamp: new Date()
    };
    messages.push(message);

    // Hide empty state
    if (messages.length > 0) {
        emptyState.classList.add('hidden');
    }

    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    
    // Render markdown for assistant messages, plain text for user messages
    if (role === 'assistant') {
        textDiv.innerHTML = renderMarkdown(text);
    } else {
        textDiv.textContent = text;
    }
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTime(message.timestamp);
    
    content.appendChild(textDiv);
    content.appendChild(timestamp);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    messagesContainer.appendChild(messageDiv);
    scrollToBottom(messagesContainer);
}

/**
 * Scroll messages container to bottom
 */
function scrollToBottom(messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

