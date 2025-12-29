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

/**
 * UI Module for Prompt/Version/Conversation UI
 * Uses the flat store architecture
 */

const PromptUI = {
    // DOM element references
    promptsList: null,
    promptHeader: null,
    promptNameDisplay: null,
    versionsContainer: null,
    conversationsContainer: null,
    saveVersionBtn: null,
    serviceSelect: null,
    modelSelect: null,
    temperatureInput: null,
    maxTokensInput: null,
    topPInput: null,
    modeToggle: null,

    // Callbacks
    onSwitchConversation: null,
    onLoadVersion: null,
    onDeleteConversation: null,
    onNewConversation: null,

    /**
     * Initialize UI module with DOM element references
     */
    init(elements) {
        this.promptsList = elements.promptsList;
        this.promptHeader = elements.promptHeader;
        this.promptNameDisplay = elements.promptNameDisplay;
        this.versionsContainer = elements.versionsContainer;
        this.conversationsContainer = elements.conversationsContainer;
        this.saveVersionBtn = elements.saveVersionBtn;
        this.serviceSelect = elements.serviceSelect;
        this.modelSelect = elements.modelSelect;
        this.temperatureInput = elements.temperatureInput;
        this.maxTokensInput = elements.maxTokensInput;
        this.topPInput = elements.topPInput;
        this.modeToggle = elements.modeToggle;
    },

    /**
     * Set callbacks for user actions
     */
    setCallbacks(callbacks) {
        this.onSwitchConversation = callbacks.onSwitchConversation;
        this.onLoadVersion = callbacks.onLoadVersion;
        this.onDeleteConversation = callbacks.onDeleteConversation;
        this.onNewConversation = callbacks.onNewConversation;
    },

    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    },

    /**
     * Refresh prompts list in sidebar
     */
    refreshPromptsList(onLoadPrompt, onDeletePrompt) {
        const prompts = PromptStore.list();
        this.promptsList.innerHTML = '';

        const state = AppState.getState();

        prompts.forEach((prompt) => {
            const promptItem = document.createElement('button');
            promptItem.className = `prompt-item ${prompt.id === state.currentPromptId ? 'active' : ''}`;
            promptItem.onclick = () => onLoadPrompt(prompt.id);

            const icon = document.createElement('span');
            icon.className = 'prompt-icon';
            icon.textContent = '📝';

            const info = document.createElement('div');
            info.className = 'prompt-info';

            const name = document.createElement('div');
            name.className = 'prompt-name';
            name.textContent = prompt.name;

            const meta = document.createElement('div');
            meta.className = 'prompt-meta';
            const versions = VersionStore.listByPrompt(prompt.id);
            const conversations = ConversationStore.listByPrompt(prompt.id);
            const versionText = versions.length > 0 ? `${versions.length}v` : '';
            const convText = conversations.length > 0 ? `${conversations.length}c` : '';
            const separator = versionText && convText ? ' · ' : '';
            meta.textContent = `${versionText}${separator}${convText} • ${this.formatDate(prompt.updatedAt || prompt.createdAt)}`;

            info.appendChild(name);
            info.appendChild(meta);

            // Indicator that becomes delete on hover
            const indicator = document.createElement('span');
            indicator.className = 'prompt-indicator';
            indicator.title = 'Delete prompt';
            indicator.onclick = (e) => {
                e.stopPropagation();
                if (onDeletePrompt) onDeletePrompt(prompt.id);
            };

            promptItem.appendChild(icon);
            promptItem.appendChild(info);
            promptItem.appendChild(indicator);
            this.promptsList.appendChild(promptItem);
        });
    },

    /**
     * Update prompt header (name and visibility)
     */
    updatePromptHeader() {
        const prompt = AppState.getCurrentPrompt();
        
        if (!prompt) {
            this.promptHeader.style.display = 'none';
            return;
        }

        this.promptHeader.style.display = 'block';
        this.promptNameDisplay.textContent = prompt.name;
    },

    /**
     * Refresh versions display
     */
    refreshVersions(onDeleteVersion) {
        const state = AppState.getFullState();
        
        if (!this.versionsContainer) return;
        this.versionsContainer.innerHTML = '';

        if (!state.prompt || state.versions.length === 0) {
            const emptyMsg = document.createElement('span');
            emptyMsg.className = 'versions-empty';
            emptyMsg.textContent = 'No saved versions';
            this.versionsContainer.appendChild(emptyMsg);
            return;
        }

        state.versions.forEach((version) => {
            const isBest = VersionStore.isBestVersion(version.id, state.prompt.id);
            const isExplicitBest = state.prompt.bestVersionId === version.id;
            
            const versionItem = document.createElement('div');
            versionItem.className = `version-pill ${isBest ? 'best' : ''}`;
            versionItem.title = version.notes || `Click to load • Created ${this.formatDate(version.createdAt)}`;
            
            // Clicking the pill loads the version
            versionItem.onclick = () => {
                if (this.onLoadVersion) {
                    this.onLoadVersion(version.id);
                }
            };
            
            // Best version star button (shows on hover, filled if best)
            const bestBtn = document.createElement('button');
            bestBtn.className = `version-pill-best ${isBest ? 'active' : ''}`;
            bestBtn.innerHTML = isBest ? '★' : '☆';
            bestBtn.title = isBest 
                ? (isExplicitBest ? 'Click to unset as best (use latest)' : 'Best version (latest)')
                : 'Mark as best version';
            bestBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleBestVersion(version.id, state.prompt.id, isBest, isExplicitBest);
            };
            versionItem.appendChild(bestBtn);
            
            const label = document.createElement('span');
            label.className = 'version-pill-label';
            const msgCount = VersionStore.getMessageCount(version.messages);
            label.textContent = `${version.id} (${msgCount})`;
            
            // Show lineage if has parent
            if (version.parentVersionId) {
                const lineage = document.createElement('span');
                lineage.className = 'version-pill-lineage';
                lineage.textContent = ` ← ${version.parentVersionId}`;
                label.appendChild(lineage);
            }
            
            versionItem.appendChild(label);
            
            // Delete button (shows on hover)
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'version-pill-delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete version';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (onDeleteVersion) onDeleteVersion(version.id);
            };
            versionItem.appendChild(deleteBtn);
            
            this.versionsContainer.appendChild(versionItem);
        });
    },

    /**
     * Toggle best version status
     */
    toggleBestVersion(versionId, promptId, isBest, isExplicitBest) {
        if (isBest && isExplicitBest) {
            // Unset explicit best, go back to "latest is best"
            PromptStore.setBestVersion(promptId, null);
        } else if (!isBest) {
            // Mark this version as best
            PromptStore.setBestVersion(promptId, versionId);
        }
        // If isBest but not explicit (it's latest), clicking sets it as explicit best
        // This allows preserving this version as best even when new versions are added
        else if (isBest && !isExplicitBest) {
            PromptStore.setBestVersion(promptId, versionId);
        }
        
        // Refresh both versions and conversations (conversations highlight based on best version)
        this.refreshVersions();
        this.refreshConversations();
    },

    /**
     * Refresh conversations display
     */
    refreshConversations() {
        const state = AppState.getFullState();
        
        if (!this.conversationsContainer) return;
        this.conversationsContainer.innerHTML = '';

        if (!state.prompt) return;

        // Get best version to check conversation origins
        const bestVersion = VersionStore.getBestVersion(state.prompt.id);
        const bestVersionId = bestVersion ? bestVersion.id : null;

        state.conversations.forEach((conversation) => {
            const isActive = conversation.id === state.activeConversationId;
            const originInfo = ConversationStore.getOriginInfo(conversation);
            const isBranch = conversation.origin?.type === 'branch';
            const isFromBestVersion = conversation.origin?.type === 'version' && 
                                       conversation.origin?.sourceId === bestVersionId;
            
            const convItem = document.createElement('div');
            convItem.className = `conversation-pill ${isActive ? 'active' : ''} ${isBranch ? 'branch' : ''} ${isFromBestVersion ? 'from-best' : ''}`;
            convItem.title = isFromBestVersion 
                ? `${originInfo.tooltip} (from best version)` 
                : originInfo.tooltip;
            convItem.onclick = () => {
                if (!isActive && this.onSwitchConversation) {
                    this.onSwitchConversation(conversation.id);
                }
            };
            
            // Star indicator for conversations from best version
            if (isFromBestVersion) {
                const bestIndicator = document.createElement('span');
                bestIndicator.className = 'conversation-pill-best';
                bestIndicator.textContent = '★';
                bestIndicator.title = 'From best version';
                convItem.appendChild(bestIndicator);
            }
            
            const label = document.createElement('span');
            label.className = 'conversation-pill-label';
            const msgCount = ConversationStore.getMessageCount(conversation.messages);
            label.textContent = `${originInfo.label} (${msgCount})`;
            
            convItem.appendChild(label);
            
            // Active indicator
            if (isActive) {
                const activeIndicator = document.createElement('span');
                activeIndicator.className = 'conversation-pill-active';
                activeIndicator.textContent = '•';
                convItem.appendChild(activeIndicator);
            }
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'conversation-pill-delete';
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete conversation';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.onDeleteConversation) {
                    this.onDeleteConversation(conversation.id);
                }
            };
            convItem.appendChild(deleteBtn);
            
            this.conversationsContainer.appendChild(convItem);
        });

        // Add "New Conversation" button
        const newConvBtn = document.createElement('button');
        newConvBtn.className = 'conversation-pill-new';
        newConvBtn.textContent = '+';
        newConvBtn.title = 'Create new conversation';
        newConvBtn.onclick = () => {
            if (this.onNewConversation) {
                this.onNewConversation();
            }
        };
        this.conversationsContainer.appendChild(newConvBtn);
    },

    /**
     * Refresh all version/conversation UI
     */
    refreshVersionsAndConversations(onDeleteVersion) {
        this.refreshVersions(onDeleteVersion);
        this.refreshConversations();
    },

    /**
     * Apply config to UI elements
     */
    applyConfig(config, updateStatusBar) {
        if (!config) return;
        
        if (this.serviceSelect) this.serviceSelect.value = config.service || '';
        if (this.modelSelect) this.modelSelect.value = config.model || '';
        window.playgroundState.responseMode = config.responseMode || 'text';

        if (config.temperature !== undefined && this.temperatureInput) {
            this.temperatureInput.value = config.temperature || '';
        }
        if (config.maxTokens !== undefined && this.maxTokensInput) {
            this.maxTokensInput.value = config.maxTokens || '';
        }
        if (config.topP !== undefined && this.topPInput) {
            this.topPInput.value = config.topP || '';
        }

        // Update mode toggle visuals
        if (this.modeToggle) {
            Array.from(this.modeToggle.querySelectorAll('.mode-toggle-button')).forEach((btn) => {
                const mode = btn.getAttribute('data-mode');
                btn.classList.toggle('mode-toggle-button-active', mode === window.playgroundState.responseMode);
            });
        }

        if (updateStatusBar) {
            updateStatusBar();
        }
    },

    /**
     * Show save version modal
     */
    showSaveVersionModal(onSave) {
        // Remove existing modal if any
        const existing = document.getElementById('saveVersionModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'saveVersionModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Save as Version</h3>
                </div>
                <div class="modal-body">
                    <p class="modal-description">Save the current conversation as an immutable version. You can load versions later to create new conversations from them.</p>
                    <label>Notes (optional):</label>
                    <input type="text" id="versionNotes" placeholder="e.g., Good baseline for support agent" autofocus />
                </div>
                <div class="modal-footer">
                    <button class="secondary-button" id="cancelVersionBtn">Cancel</button>
                    <button class="primary-button" id="confirmVersionBtn">Save Version</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Focus the notes input
        setTimeout(() => {
            document.getElementById('versionNotes')?.focus();
        }, 100);

        // Handle cancel
        document.getElementById('cancelVersionBtn').onclick = () => modal.remove();
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

        // Handle save
        document.getElementById('confirmVersionBtn').onclick = () => {
            const notes = document.getElementById('versionNotes').value.trim();
            onSave(notes);
            modal.remove();
        };

        // Handle enter key
        document.getElementById('versionNotes').onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('confirmVersionBtn').click();
            }
        };
    }
};
