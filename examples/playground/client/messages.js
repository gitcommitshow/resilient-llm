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
 * @param {string} role - Message role ('user', 'assistant', or 'assistant_manual')
 * @param {Array} messages - Messages array (will be updated)
 * @param {HTMLElement} messagesContainer - Container element
 * @param {HTMLElement} emptyState - Empty state element
 * @param {Object} [options] - Additional options (e.g., manual flag, metadata)
 */
function addMessage(text, role, messages, messagesContainer, emptyState, options = {}) {
    const message = {
        id: Date.now() + Math.random().toString(16).slice(2),
        text,
        role,
        timestamp: new Date(),
        meta: options.meta || null,
        manual: options.manual || false
    };
    messages.push(message);

    // Hide empty state
    if (messages.length > 0) {
        emptyState.classList.add('hidden');
    }

    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.dataset.messageId = message.id;
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = role === 'user' ? 'U' : 'AI';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    
    // Render content depending on role and current mode
    const isAssistant = role === 'assistant' || role === 'assistant_manual';
    const responseMode = (window.playgroundState && window.playgroundState.responseMode) || 'text';

    if (isAssistant && responseMode === 'json') {
        // Try to pretty-print JSON, fall back to raw text with an error banner
        const jsonContainer = document.createElement('div');
        jsonContainer.className = 'json-message-container';

        const toolbar = document.createElement('div');
        toolbar.className = 'json-message-toolbar';

        const label = document.createElement('span');
        label.textContent = 'JSON view';
        toolbar.appendChild(label);

        jsonContainer.appendChild(toolbar);

        const body = document.createElement('pre');
        body.className = 'json-message-body';

        try {
            const parsed = JSON.parse(text);
            body.textContent = JSON.stringify(parsed, null, 2);
        } catch (err) {
            const errorBanner = document.createElement('div');
            errorBanner.className = 'json-message-error';
            errorBanner.textContent = 'Response is not valid JSON. Showing raw output.';
            jsonContainer.appendChild(errorBanner);
            body.textContent = text;
        }

        jsonContainer.appendChild(body);
        textDiv.appendChild(jsonContainer);
    } else if (isAssistant) {
        textDiv.innerHTML = renderMarkdown(text);
    } else {
        textDiv.textContent = text;
    }
    
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTime(message.timestamp);

    footer.appendChild(timestamp);

    if (message.manual && isAssistant) {
        const badge = document.createElement('span');
        badge.className = 'message-badge';
        badge.textContent = 'Manual';
        footer.appendChild(badge);
    }

    content.appendChild(textDiv);
    content.appendChild(footer);
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

