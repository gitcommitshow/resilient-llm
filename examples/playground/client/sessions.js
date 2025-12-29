/**
 * Prompt Engineering Data Layer
 * 
 * Flat storage architecture with separate stores for maximum extensibility.
 * 
 * Entities:
 * - Prompt: Workspace metadata (name, timestamps)
 * - Version: Immutable frozen snapshot of messages + config
 * - Conversation: Mutable chat session (messages + config)
 * 
 * Each entity is independent and references others by ID.
 * 
 * Origin Types:
 * - 'fresh': New conversation from scratch
 * - 'version': Created from loading a version
 * - 'branch': Branched from another conversation at a specific message
 */

const STORAGE_KEY = 'resilientllm_playground_v3';

// ============================================
// UTILITIES
// ============================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadStorage() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { prompts: [], versions: [], conversations: [] };
        }
        const data = JSON.parse(raw);
        // Ensure all arrays exist
        return {
            prompts: data.prompts || [],
            versions: data.versions || [],
            conversations: data.conversations || []
        };
    } catch {
        return { prompts: [], versions: [], conversations: [] };
    }
}

function saveStorage(data) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ============================================
// PROMPT STORE
// ============================================

const PromptStore = {
    create(name = 'New Prompt') {
        const data = loadStorage();
        const prompt = {
            id: generateId(),
            name: name,
            bestVersionId: null, // null means latest version is the best
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        data.prompts.push(prompt);
        saveStorage(data);
        return prompt;
    },

    get(id) {
        const data = loadStorage();
        return data.prompts.find(p => p.id === id) || null;
    },

    update(id, updates) {
        const data = loadStorage();
        const prompt = data.prompts.find(p => p.id === id);
        if (!prompt) return null;

        if (updates.name !== undefined) prompt.name = updates.name;
        if (updates.bestVersionId !== undefined) prompt.bestVersionId = updates.bestVersionId;
        prompt.updatedAt = new Date().toISOString();

        saveStorage(data);
        return prompt;
    },

    /**
     * Set the best version for a prompt
     * @param {string} promptId 
     * @param {string|null} versionId - null to reset to "latest is best"
     */
    setBestVersion(promptId, versionId) {
        return this.update(promptId, { bestVersionId: versionId });
    },

    /**
     * Get the best version ID for a prompt
     * Returns the explicitly set best version, or null if latest is best
     */
    getBestVersionId(promptId) {
        const prompt = this.get(promptId);
        return prompt ? prompt.bestVersionId : null;
    },

    delete(id) {
        const data = loadStorage();
        const index = data.prompts.findIndex(p => p.id === id);
        if (index === -1) return false;

        data.prompts.splice(index, 1);
        // Also delete related versions and conversations
        data.versions = data.versions.filter(v => v.promptId !== id);
        data.conversations = data.conversations.filter(c => c.promptId !== id);

        saveStorage(data);
        return true;
    },

    list() {
        const data = loadStorage();
        return [...data.prompts].sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt);
            const dateB = new Date(b.updatedAt || b.createdAt);
            return dateB - dateA;
        });
    },

    /**
     * Generate name from first user message or system prompt
     */
    generateName(messages) {
        const userMessages = (messages || []).filter(m => m.role === 'user');
        if (userMessages.length > 0) {
            const text = userMessages[0].text;
            return text.slice(0, 35) + (text.length > 35 ? '...' : '');
        }
        // Try system prompt
        const systemMsg = (messages || []).find(m => m.role === 'system');
        if (systemMsg && systemMsg.text && systemMsg.text.trim()) {
            const text = systemMsg.text.trim();
            return text.slice(0, 35) + (text.length > 35 ? '...' : '');
        }
        const now = new Date();
        return `Prompt ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
};

// ============================================
// VERSION STORE
// ============================================

const VersionStore = {
    create(promptId, { messages, config, parentVersionId = null, notes = '' }) {
        const data = loadStorage();
        
        // Generate version number for this prompt
        const promptVersions = data.versions.filter(v => v.promptId === promptId);
        const versionNumber = promptVersions.length + 1;

        const version = {
            id: `v${versionNumber}`,
            promptId: promptId,
            messages: (messages || []).map(m => ({ ...m })),
            config: { ...config },
            parentVersionId: parentVersionId,
            createdAt: new Date().toISOString(),
            notes: notes
        };

        data.versions.push(version);
        
        // Update prompt's updatedAt
        const prompt = data.prompts.find(p => p.id === promptId);
        if (prompt) {
            prompt.updatedAt = new Date().toISOString();
        }

        saveStorage(data);
        return version;
    },

    get(id, promptId) {
        const data = loadStorage();
        return data.versions.find(v => v.id === id && v.promptId === promptId) || null;
    },

    delete(id, promptId) {
        const data = loadStorage();
        const index = data.versions.findIndex(v => v.id === id && v.promptId === promptId);
        if (index === -1) return false;

        data.versions.splice(index, 1);
        saveStorage(data);
        return true;
    },

    listByPrompt(promptId) {
        const data = loadStorage();
        return data.versions
            .filter(v => v.promptId === promptId)
            .sort((a, b) => {
                // Sort by version number (v1, v2, v3...)
                const numA = parseInt(a.id.replace('v', ''), 10);
                const numB = parseInt(b.id.replace('v', ''), 10);
                return numA - numB;
            });
    },

    getMessageCount(messages) {
        return (messages || []).filter(m => m.role !== 'system').length;
    },

    /**
     * Get the best version for a prompt
     * Returns explicitly marked best version, or the latest version if none is set
     * @param {string} promptId 
     * @returns {Object|null} The best version object or null if no versions exist
     */
    getBestVersion(promptId) {
        const versions = this.listByPrompt(promptId);
        if (versions.length === 0) return null;

        const bestVersionId = PromptStore.getBestVersionId(promptId);
        
        if (bestVersionId) {
            const bestVersion = versions.find(v => v.id === bestVersionId);
            if (bestVersion) return bestVersion;
        }
        
        // Default to latest version (last in sorted list)
        return versions[versions.length - 1];
    },

    /**
     * Check if a version is the best version for its prompt
     * @param {string} versionId 
     * @param {string} promptId 
     * @returns {boolean}
     */
    isBestVersion(versionId, promptId) {
        const bestVersion = this.getBestVersion(promptId);
        return bestVersion ? bestVersion.id === versionId : false;
    }
};

// ============================================
// CONVERSATION STORE
// ============================================

/**
 * Origin object structure:
 * {
 *   type: 'fresh' | 'version' | 'branch',
 *   sourceId: string | null,     // version id or conversation id
 *   atMessageId: string | null   // for branches: message id where branched
 * }
 */

const ConversationStore = {
    /**
     * Create a new conversation
     * @param {string} promptId 
     * @param {Object} options
     * @param {Array} options.messages
     * @param {Object} options.config
     * @param {Object} options.origin - { type, sourceId, atMessageId }
     */
    create(promptId, { messages = [], config = {}, origin = null } = {}) {
        const data = loadStorage();

        // Default origin is 'fresh'
        const finalOrigin = origin || { type: 'fresh', sourceId: null, atMessageId: null };

        const conversation = {
            id: 'conv-' + generateId(),
            promptId: promptId,
            messages: (messages || []).map(m => ({ ...m })),
            config: { ...config },
            origin: finalOrigin,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        data.conversations.push(conversation);
        saveStorage(data);
        return conversation;
    },

    get(id) {
        const data = loadStorage();
        return data.conversations.find(c => c.id === id) || null;
    },

    update(id, { messages, config }) {
        const data = loadStorage();
        const conversation = data.conversations.find(c => c.id === id);
        if (!conversation) return null;

        if (messages !== undefined) {
            conversation.messages = messages.map(m => ({
                id: m.id,
                role: m.role,
                text: m.text,
                timestamp: m.timestamp
            }));
        }
        if (config !== undefined) {
            conversation.config = { ...config };
        }
        conversation.updatedAt = new Date().toISOString();

        // Update prompt's updatedAt
        const prompt = data.prompts.find(p => p.id === conversation.promptId);
        if (prompt) {
            prompt.updatedAt = new Date().toISOString();
        }

        saveStorage(data);
        return conversation;
    },

    /**
     * Update conversation's origin (e.g., after saving as version)
     */
    updateOrigin(id, origin) {
        const data = loadStorage();
        const conversation = data.conversations.find(c => c.id === id);
        if (!conversation) return null;

        conversation.origin = { ...origin };
        conversation.updatedAt = new Date().toISOString();

        saveStorage(data);
        return conversation;
    },

    delete(id) {
        const data = loadStorage();
        const index = data.conversations.findIndex(c => c.id === id);
        if (index === -1) return false;

        data.conversations.splice(index, 1);
        saveStorage(data);
        return true;
    },

    listByPrompt(promptId) {
        const data = loadStorage();
        return data.conversations
            .filter(c => c.promptId === promptId)
            .sort((a, b) => {
                const dateA = new Date(a.updatedAt || a.createdAt);
                const dateB = new Date(b.updatedAt || b.createdAt);
                return dateB - dateA;
            });
    },

    getMessageCount(messages) {
        return (messages || []).filter(m => m.role !== 'system').length;
    },

    /**
     * Get label for conversation display based on origin
     */
    getLabel(conversation) {
        if (!conversation || !conversation.origin) return 'new';
        
        const origin = conversation.origin;
        
        switch (origin.type) {
            case 'version':
                return `from ${origin.sourceId}`;
            case 'branch':
                return `↳ branch`;
            case 'fresh':
            default:
                return 'new';
        }
    },

    /**
     * Get detailed origin info for display
     */
    getOriginInfo(conversation) {
        if (!conversation || !conversation.origin) {
            return { label: 'new', tooltip: 'Fresh conversation' };
        }
        
        const origin = conversation.origin;
        
        switch (origin.type) {
            case 'version':
                return {
                    label: `from ${origin.sourceId}`,
                    tooltip: `Created from version ${origin.sourceId}`
                };
            case 'branch':
                return {
                    label: '↳ branch',
                    tooltip: `Branched from another conversation`
                };
            case 'fresh':
            default:
                return {
                    label: 'new',
                    tooltip: 'Fresh conversation'
                };
        }
    }
};

// ============================================
// APP STATE (in-memory)
// ============================================

const AppState = {
    currentPromptId: null,
    activeConversationId: null,

    setCurrentPrompt(promptId) {
        this.currentPromptId = promptId;
    },

    setActiveConversation(conversationId) {
        this.activeConversationId = conversationId;
    },

    getState() {
        return {
            currentPromptId: this.currentPromptId,
            activeConversationId: this.activeConversationId
        };
    },

    getCurrentPrompt() {
        if (!this.currentPromptId) return null;
        return PromptStore.get(this.currentPromptId);
    },

    getActiveConversation() {
        if (!this.activeConversationId) return null;
        return ConversationStore.get(this.activeConversationId);
    },

    /**
     * Get full state with related data
     */
    getFullState() {
        const prompt = this.getCurrentPrompt();
        const conversation = this.getActiveConversation();
        
        return {
            currentPromptId: this.currentPromptId,
            activeConversationId: this.activeConversationId,
            prompt: prompt,
            activeConversation: conversation,
            versions: prompt ? VersionStore.listByPrompt(prompt.id) : [],
            conversations: prompt ? ConversationStore.listByPrompt(prompt.id) : []
        };
    }
};

// ============================================
// HIGH-LEVEL OPERATIONS
// ============================================

/**
 * Create a new prompt with an initial empty conversation
 */
function createNewPrompt() {
    const prompt = PromptStore.create();
    const conversation = ConversationStore.create(prompt.id, {
        origin: { type: 'fresh', sourceId: null, atMessageId: null }
    });
    
    AppState.setCurrentPrompt(prompt.id);
    AppState.setActiveConversation(conversation.id);
    
    return { prompt, conversation };
}

/**
 * Load a prompt and switch to its most recent conversation (or create one)
 */
function loadPrompt(promptId) {
    const prompt = PromptStore.get(promptId);
    if (!prompt) return null;

    AppState.setCurrentPrompt(promptId);

    // Get conversations for this prompt
    const conversations = ConversationStore.listByPrompt(promptId);
    
    if (conversations.length > 0) {
        // Use most recent conversation
        AppState.setActiveConversation(conversations[0].id);
    } else {
        // Create a new conversation
        const conversation = ConversationStore.create(promptId, {
            origin: { type: 'fresh', sourceId: null, atMessageId: null }
        });
        AppState.setActiveConversation(conversation.id);
    }

    return AppState.getFullState();
}

/**
 * Create a new conversation from a version
 */
function loadVersionIntoNewConversation(versionId) {
    const state = AppState.getState();
    if (!state.currentPromptId) return null;

    const version = VersionStore.get(versionId, state.currentPromptId);
    if (!version) return null;

    // Count non-system messages from the version (used for separator)
    const versionMessageCount = (version.messages || []).filter(m => m.role !== 'system').length;

    // Always create a new conversation with version origin
    const conversation = ConversationStore.create(state.currentPromptId, {
        messages: version.messages,
        config: version.config,
        origin: {
            type: 'version',
            sourceId: versionId,
            atMessageId: null,
            versionMessageCount: versionMessageCount
        }
    });

    AppState.setActiveConversation(conversation.id);
    return conversation;
}

/**
 * Create a new empty conversation
 */
function createNewConversation() {
    const state = AppState.getState();
    if (!state.currentPromptId) return null;

    const conversation = ConversationStore.create(state.currentPromptId, {
        origin: { type: 'fresh', sourceId: null, atMessageId: null }
    });
    AppState.setActiveConversation(conversation.id);
    return conversation;
}

/**
 * Branch a conversation at a specific message
 * Creates a new conversation with messages up to (and including) the specified message
 */
function branchConversation(conversationId, atMessageId) {
    const source = ConversationStore.get(conversationId);
    if (!source) return null;

    // Find the message index
    const messageIndex = source.messages.findIndex(m => m.id === atMessageId);
    if (messageIndex === -1) return null;

    // Copy messages up to and including the branch point
    const branchedMessages = source.messages.slice(0, messageIndex + 1).map(m => ({ ...m }));

    // Create new conversation with branch origin
    const conversation = ConversationStore.create(source.promptId, {
        messages: branchedMessages,
        config: { ...source.config },
        origin: {
            type: 'branch',
            sourceId: conversationId,
            atMessageId: atMessageId
        }
    });

    AppState.setActiveConversation(conversation.id);
    return conversation;
}

/**
 * Switch to a different conversation
 */
function switchToConversation(conversationId) {
    const conversation = ConversationStore.get(conversationId);
    if (!conversation) return null;

    AppState.setActiveConversation(conversationId);
    return conversation;
}

/**
 * Save current conversation as a version
 */
function saveConversationAsVersion(notes = '') {
    const state = AppState.getState();
    if (!state.currentPromptId || !state.activeConversationId) return null;

    const conversation = ConversationStore.get(state.activeConversationId);
    if (!conversation) return null;

    // Get parent version ID from origin if it was from a version
    const parentVersionId = conversation.origin?.type === 'version' 
        ? conversation.origin.sourceId 
        : null;

    const version = VersionStore.create(state.currentPromptId, {
        messages: conversation.messages,
        config: conversation.config,
        parentVersionId: parentVersionId,
        notes: notes
    });

    // Count non-system messages for separator logic
    const versionMessageCount = (conversation.messages || []).filter(m => m.role !== 'system').length;

    // Update conversation's origin to reference the new version
    ConversationStore.updateOrigin(conversation.id, {
        type: 'version',
        sourceId: version.id,
        atMessageId: null,
        versionMessageCount: versionMessageCount
    });

    return version;
}

/**
 * Auto-save current conversation state
 */
function autoSaveConversation(messages, config) {
    const state = AppState.getState();
    if (!state.activeConversationId) return;

    ConversationStore.update(state.activeConversationId, { messages, config });

    // Auto-update prompt name if still default
    if (state.currentPromptId) {
        const prompt = PromptStore.get(state.currentPromptId);
        if (prompt && prompt.name === 'New Prompt') {
            const newName = PromptStore.generateName(messages);
            if (newName !== 'New Prompt' && !newName.startsWith('Prompt ')) {
                PromptStore.update(state.currentPromptId, { name: newName });
            }
        }
    }
}

/**
 * Delete a conversation
 */
function deleteConversation(conversationId) {
    const state = AppState.getState();
    const isActive = conversationId === state.activeConversationId;

    ConversationStore.delete(conversationId);

    // If we deleted the active conversation, switch to another or create new
    if (isActive && state.currentPromptId) {
        const conversations = ConversationStore.listByPrompt(state.currentPromptId);
        if (conversations.length > 0) {
            AppState.setActiveConversation(conversations[0].id);
        } else {
            const newConv = ConversationStore.create(state.currentPromptId, {
                origin: { type: 'fresh', sourceId: null, atMessageId: null }
            });
            AppState.setActiveConversation(newConv.id);
        }
    }

    return AppState.getFullState();
}

