/**
 * Application state with event emission
 * Supports multiple open panels and cross-component communication
 */

export class State {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();
        
        this.state = {
            /** Current prompt ID */
            currentPromptId: null,
            
            /** Active conversation ID */
            activeConversationId: null,
            
            /** Open panels: [{ panelId, promptId, conversationId }] */
            openPanels: [],
            
            /** Currently focused panel ID */
            focusedPanelId: null,
            
            /** Whether settings drawer is open */
            settingsOpen: false,
            
            /** Currently editing message ID */
            editingMessageId: null,
            
            /** Response mode: 'text' or 'json' */
            responseMode: 'text',
            
            /** Sender role: 'user' or 'assistant' */
            senderRole: 'user',
            
            /** Global config (can be overridden per panel) */
            globalConfig: {
                service: '',
                model: '',
                temperature: '',
                maxTokens: '',
                topP: ''
            }
        };
    }

    /**
     * Get a state value
     * @param {string} key
     * @returns {*}
     */
    get(key) {
        return this.state[key];
    }

    /**
     * Set a state value and emit change event
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        this.emit(`${key}:changed`, value, oldValue);
        this.emit('state:changed', { key, value, oldValue });
    }

    /**
     * Update multiple state values at once
     * @param {Object} updates
     */
    update(updates) {
        Object.entries(updates).forEach(([key, value]) => {
            this.state[key] = value;
        });
        this.emit('state:changed', updates);
    }

    /**
     * Subscribe to an event
     * @param {string} event
     * @param {Function} callback
     * @returns {Function} Unsubscribe function
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    /**
     * Emit an event
     * @param {string} event
     * @param {...*} args
     */
    emit(event, ...args) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in event handler for ${event}:`, error);
                }
            });
        }
    }

    /**
     * Get the full state object (for debugging)
     * @returns {Object}
     */
    getAll() {
        return { ...this.state };
    }

    /**
     * Reset state to defaults
     */
    reset() {
        this.state = {
            currentPromptId: null,
            activeConversationId: null,
            openPanels: [],
            focusedPanelId: null,
            settingsOpen: false,
            editingMessageId: null,
            responseMode: 'text',
            senderRole: 'user',
            globalConfig: {
                service: '',
                model: '',
                temperature: '',
                maxTokens: '',
                topP: ''
            }
        };
        this.emit('state:reset');
    }
}

// Export a singleton instance for the application
export const state = new State();

