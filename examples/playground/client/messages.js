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
    
    // System messages are handled separately in the pinned component
    if (message.role === 'system') {
        if (window.updatePinnedSystemPrompt) {
            window.updatePinnedSystemPrompt(message, isEditing);
        }
        return;
    }
    
    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = message.role === 'user' ? 'U' : 'AI';
    
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
            
            // Make JSON container clickable to edit (but not the pre element inside)
            textDiv.style.cursor = 'pointer';
            jsonContainer.style.cursor = 'pointer';
            body.style.cursor = 'default'; // Don't show pointer on the code itself
            textDiv.addEventListener('click', (e) => {
                // Only trigger edit if clicking on the container, not the code
                if (e.target === textDiv || e.target === jsonContainer || e.target === toolbar) {
                    if (!isEditing) {
                        startMessageEdit(messageId);
                    }
                }
            });
        } else {
            // Apply markdown formatting to all messages (user, assistant, etc.)
            textDiv.innerHTML = renderMarkdown(message.text);
            
            // Make message text clickable to edit
            textDiv.style.cursor = 'pointer';
            textDiv.addEventListener('click', () => {
                if (!isEditing) {
                    startMessageEdit(messageId);
                }
            });
        }
        
        content.appendChild(textDiv);
        
        // Add delete button on hover
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'message-action-btn';
        deleteBtn.title = 'Delete message';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 3.5V2.5C5.5 2.22386 5.72386 2 6 2H8C8.27614 2 8.5 2.22386 8.5 2.5V3.5M11.5 3.5H2.5M10.5 3.5V11.5C10.5 12.0523 10.0523 12.5 9.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering edit when clicking delete
            deleteMessage(messageId);
        });
        
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
    
    
    // If this is a system message and the last message is an AI response, retrigger AI
    if (message.role === 'system') {
        const messages = window.playgroundMessages || [];
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && (lastMessage.role === 'assistant' || lastMessage.role === 'assistant_manual')) {
            // Retrigger AI response with updated system prompt
            if (window.triggerAIResponse) {
                // Small delay to ensure the system prompt update is processed
                setTimeout(() => {
                    window.triggerAIResponse(true); // Pass true to indicate regeneration
                }, 100);
            }
        }
        return; // Don't continue with user message logic for system messages
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
    
    // Re-render in normal mode (or update pinned component for system messages)
    if (message.role === 'system') {
        if (window.updatePinnedSystemPrompt) {
            window.updatePinnedSystemPrompt(message, false);
        }
    } else {
        const messagesContainer = document.getElementById('messagesContainer');
        renderMessage(message, messagesContainer, false);
    }
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

