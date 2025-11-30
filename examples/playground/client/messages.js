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
        manual: options.manual || false,
        originalText: text // Store original for undo
    };
    messages.push(message);
    
    // Sync global reference
    if (window.playgroundMessages) {
        window.playgroundMessages = messages;
    }

    // Hide empty state
    if (messages.length > 0 && emptyState) {
        emptyState.classList.add('hidden');
    }

    renderMessage(message, messagesContainer);
    scrollToBottom(messagesContainer);
}

/**
 * Render a message in the UI (or re-render if editing)
 * @param {Object} message - Message object
 * @param {HTMLElement} messagesContainer - Container element
 * @param {boolean} isEditing - Whether message is in edit mode
 */
function renderMessage(message, messagesContainer, isEditing = false) {
    const messageId = message.id;
    let messageDiv = messagesContainer.querySelector(`[data-message-id="${messageId}"]`);
    
    // Create new message element if it doesn't exist
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        messageDiv.dataset.messageId = messageId;
        messagesContainer.appendChild(messageDiv);
    } else {
        // Clear existing content
        messageDiv.innerHTML = '';
        messageDiv.className = `message ${message.role}`;
    }
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (message.role === 'system') {
        avatar.textContent = '⚙️';
    } else {
        avatar.textContent = message.role === 'user' ? 'U' : 'AI';
    }
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    if (isEditing) {
        // Edit mode: show textarea
        const textarea = document.createElement('textarea');
        textarea.className = 'message-edit-textarea';
        textarea.value = message.text;
        textarea.rows = Math.max(3, Math.min(10, message.text.split('\n').length));
        
        // Save on Enter (without Shift), cancel on Escape
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveMessageEdit(messageId, textarea.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelMessageEdit(messageId);
            }
        });
        
        // Auto-resize textarea
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
        
        content.appendChild(textarea);
        textarea.focus();
        textarea.select();
    } else {
        // Normal mode: show formatted text
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        
        // Special handling for system messages (simple text display)
        if (message.role === 'system') {
            textDiv.textContent = message.text;
        } else {
            // Render content depending on role and current mode
            const isAssistant = message.role === 'assistant' || message.role === 'assistant_manual';
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
                    const parsed = JSON.parse(message.text);
                    body.textContent = JSON.stringify(parsed, null, 2);
                } catch (err) {
                    const errorBanner = document.createElement('div');
                    errorBanner.className = 'json-message-error';
                    errorBanner.textContent = 'Response is not valid JSON. Showing raw output.';
                    jsonContainer.appendChild(errorBanner);
                    body.textContent = message.text;
                }

                jsonContainer.appendChild(body);
                textDiv.appendChild(jsonContainer);
            } else if (isAssistant) {
                textDiv.innerHTML = renderMarkdown(message.text);
            } else {
                textDiv.textContent = message.text;
            }
        }
        
        content.appendChild(textDiv);
        
        // Add action buttons on hover
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn';
        editBtn.title = 'Edit message';
        editBtn.innerHTML = '✏️';
        editBtn.addEventListener('click', () => startMessageEdit(messageId));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'message-action-btn';
        deleteBtn.title = 'Delete message';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.addEventListener('click', () => deleteMessage(messageId));
        
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        content.appendChild(actions);
    }
    
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const timestamp = document.createElement('div');
    timestamp.className = 'message-timestamp';
    timestamp.textContent = formatTime(message.timestamp);

    footer.appendChild(timestamp);

    if (message.manual && (message.role === 'assistant' || message.role === 'assistant_manual')) {
        const badge = document.createElement('span');
        badge.className = 'message-badge';
        badge.textContent = 'Manual';
        footer.appendChild(badge);
    }

    content.appendChild(footer);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
}

/**
 * Start editing a message
 */
function startMessageEdit(messageId) {
    const message = window.playgroundMessages?.find(m => m.id === messageId);
    if (!message) return;
    
    const messagesContainer = document.getElementById('messagesContainer');
    renderMessage(message, messagesContainer, true);
}

/**
 * Save message edit
 */
function saveMessageEdit(messageId, newText) {
    const message = window.playgroundMessages?.find(m => m.id === messageId);
    if (!message) return;
    
    // Store original for undo
    const originalText = message.text;
    
    // Update message
    message.text = newText.trim();
    message.originalText = originalText;
    
    // Re-render in normal mode
    const messagesContainer = document.getElementById('messagesContainer');
    renderMessage(message, messagesContainer, false);
    
    // Store undo action
    if (window.playgroundUndoStack) {
        window.playgroundUndoStack.push({
            type: 'edit',
            messageId: messageId,
            oldText: originalText,
            newText: newText.trim()
        });
        showUndoOption();
    }
    
    // If this is a system message, update placeholder visibility
    if (message.role === 'system') {
        if (window.updateSystemPromptPlaceholder) {
            window.updateSystemPromptPlaceholder();
        }
    }
    
    // If this is the last message and it's a user message, trigger AI response
    const messages = window.playgroundMessages || [];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.id === messageId && 
        (lastMessage.role === 'user' || lastMessage.role === 'user_manual')) {
        // Trigger AI response
        if (window.triggerAIResponse) {
            window.triggerAIResponse();
        }
    }
}

/**
 * Cancel message edit
 */
function cancelMessageEdit(messageId) {
    const message = window.playgroundMessages?.find(m => m.id === messageId);
    if (!message) return;
    
    // Revert to original text
    if (message.originalText) {
        message.text = message.originalText;
    }
    
    // Re-render in normal mode
    const messagesContainer = document.getElementById('messagesContainer');
    renderMessage(message, messagesContainer, false);
}

/**
 * Delete a message
 */
function deleteMessage(messageId) {
    const messages = window.playgroundMessages;
    if (!messages) return;
    
    const index = messages.findIndex(m => m.id === messageId);
    if (index === -1) return;
    
    const message = messages[index];
    
    // Remove from array
    messages.splice(index, 1);
    
    // Remove from UI
    const messageDiv = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageDiv) {
        messageDiv.remove();
    }
    
    // Show empty state if no messages
    const emptyState = document.getElementById('emptyState');
    if (messages.length === 0 && emptyState) {
        emptyState.classList.remove('hidden');
    }
    
    // Store undo action
    if (window.playgroundUndoStack) {
        window.playgroundUndoStack.push({
            type: 'delete',
            message: message,
            index: index
        });
        showUndoOption();
    }
    
    // Update system prompt placeholder visibility
    if (window.updateSystemPromptPlaceholder) {
        window.updateSystemPromptPlaceholder();
    }
    
    // If the last message is now a user message, trigger AI response
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && (lastMessage.role === 'user' || lastMessage.role === 'user_manual')) {
        // Trigger AI response
        if (window.triggerAIResponse) {
            window.triggerAIResponse();
        }
    }
}

/**
 * Scroll messages container to bottom
 */
function scrollToBottom(messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

