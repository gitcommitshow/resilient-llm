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

/**
 * Load and display library info (version and source)
 */
async function loadLibraryInfo() {
    try {
        const response = await fetch('/api/library-info');
        const info = await response.json();
        
        const versionEl = document.getElementById('libraryVersion');
        const sourceEl = document.getElementById('librarySource');
        const sourceLinkEl = document.getElementById('librarySourceLink');
        
        if (versionEl) {
            versionEl.textContent = `v${info.version}`;
        }
        
        if (sourceEl) {
            sourceEl.textContent = info.source;
            sourceEl.className = `library-source ${info.source}`;
        }
        
        if (sourceLinkEl && info.sourcePath) {
            sourceLinkEl.href = info.sourcePath;
            if (info.source === 'local') {
                sourceLinkEl.removeAttribute('target');
                sourceLinkEl.removeAttribute('rel');
            }
        }
    } catch (error) {
        console.error('Error loading library info:', error);
    }
}

// Load library info on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadLibraryInfo);
} else {
    loadLibraryInfo();
}

