/**
 * Message class - represents a single message in a conversation
 * Messages are stored inside Conversations, not separately in storage
 */

export class Message {
    /**
     * @param {Object} data
     * @param {string} data.text
     * @param {'system'|'user'|'assistant'} data.role
     * @param {string} [data.id] - Auto-generated if not provided
     * @param {string|Date} [data.timestamp] - Auto-set to now if not provided
     */
    constructor({ text, role, id, timestamp }) {
        this.id = id || Message.generateId();
        this.text = text || '';
        this.role = role;
        this.timestamp = timestamp 
            ? (timestamp instanceof Date ? timestamp.toISOString() : timestamp)
            : new Date().toISOString();
        this.originalText = text || ''; // For undo support
    }

    /**
     * Generate a unique ID for a message
     * @returns {string}
     */
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Create a Message instance from plain object (for deserialization)
     * @param {Object} data
     * @returns {Message}
     */
    static fromData(data) {
        const msg = new Message({
            id: data.id,
            text: data.text,
            role: data.role,
            timestamp: data.timestamp
        });
        // Preserve originalText if it exists
        if (data.originalText !== undefined) {
            msg.originalText = data.originalText;
        }
        return msg;
    }

    /**
     * Convert to plain object for serialization
     * @returns {Object}
     */
    toData() {
        return {
            id: this.id,
            text: this.text,
            role: this.role,
            timestamp: this.timestamp
        };
    }

    /**
     * Get timestamp as Date object
     * @returns {Date}
     */
    getDate() {
        return new Date(this.timestamp);
    }

    /**
     * Check if this is a system message
     * @returns {boolean}
     */
    isSystem() {
        return this.role === 'system';
    }

    /**
     * Check if this is a user message
     * @returns {boolean}
     */
    isUser() {
        return this.role === 'user';
    }

    /**
     * Check if this is an assistant message
     * @returns {boolean}
     */
    isAssistant() {
        return this.role === 'assistant';
    }

    /**
     * Update the message text
     * @param {string} newText
     */
    updateText(newText) {
        this.originalText = this.text;
        this.text = newText;
    }

    /**
     * Revert to original text
     */
    revert() {
        if (this.originalText !== undefined) {
            this.text = this.originalText;
        }
    }
}

