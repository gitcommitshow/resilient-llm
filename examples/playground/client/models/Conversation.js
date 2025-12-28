/**
 * Conversation class - represents a mutable chat session
 */
import { Storage } from '../core/Storage.js';
import { Message } from './Message.js';

/**
 * @typedef {Object} ConversationOrigin
 * @property {'fresh'|'version'|'branch'} type
 * @property {string|null} sourceId
 * @property {string|null} atMessageId
 * @property {number} [versionMessageCount]
 */

export class Conversation {
    /**
     * @param {Object} data
     * @param {string} [data.id]
     * @param {string} data.promptId
     * @param {Message[]|Object[]} [data.messages] - Array of Message instances or plain objects
     * @param {Object} [data.config]
     * @param {ConversationOrigin} [data.origin]
     * @param {string} [data.createdAt]
     * @param {string} [data.updatedAt]
     */
    constructor({ id, promptId, messages = [], config = {}, origin = null, createdAt, updatedAt }) {
        this.id = id || Conversation.generateId();
        this.promptId = promptId;
        this.messages = messages.map(m => m instanceof Message ? m : Message.fromData(m));
        this.config = { ...config };
        this.origin = origin || { type: 'fresh', sourceId: null, atMessageId: null };
        const now = new Date().toISOString();
        this.createdAt = createdAt || now;
        this.updatedAt = updatedAt || now;
    }

    /**
     * Generate a unique ID for a conversation
     * @returns {string}
     */
    static generateId() {
        return 'conv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Create a new Conversation instance and save to storage
     * @param {string} promptId
     * @param {Object} [options]
     * @param {Message[]|Object[]} [options.messages]
     * @param {Object} [options.config]
     * @param {ConversationOrigin} [options.origin]
     * @returns {Conversation}
     */
    static create(promptId, options = {}) {
        const conversation = new Conversation({
            promptId,
            messages: options.messages || [],
            config: options.config || {},
            origin: options.origin || { type: 'fresh', sourceId: null, atMessageId: null }
        });
        return conversation.save();
    }

    /**
     * Load a Conversation from storage
     * @param {string} id
     * @returns {Conversation|null}
     */
    static get(id) {
        const data = Storage.get('conversations').find(c => c.id === id);
        return data ? Conversation.fromData(data) : null;
    }

    /**
     * Create from plain object (deserialization)
     * @param {Object} data
     * @returns {Conversation}
     */
    static fromData(data) {
        return new Conversation(data);
    }

    /**
     * Save this conversation to storage
     * @returns {Conversation}
     */
    save() {
        this.updatedAt = new Date().toISOString();
        const all = Storage.get('conversations');
        const index = all.findIndex(c => c.id === this.id);
        if (index >= 0) {
            all[index] = this.toData();
        } else {
            all.push(this.toData());
        }
        Storage.set('conversations', all);
        return this;
    }

    /**
     * Delete this conversation from storage
     */
    delete() {
        const all = Storage.get('conversations').filter(c => c.id !== this.id);
        Storage.set('conversations', all);
    }

    /**
     * Get all conversations for a prompt, sorted by updatedAt (most recent first)
     * @param {string} promptId
     * @returns {Conversation[]}
     */
    static listByPrompt(promptId) {
        return Storage.get('conversations')
            .filter(c => c.promptId === promptId)
            .map(c => Conversation.fromData(c))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    /**
     * Add a message to this conversation
     * @param {Message|Object} message
     * @returns {Message}
     */
    addMessage(message) {
        const msg = message instanceof Message ? message : new Message(message);
        this.messages.push(msg);
        this.save();
        return msg;
    }

    /**
     * Update a message in this conversation
     * @param {string} messageId
     * @param {string} newText
     * @returns {Message|null}
     */
    updateMessage(messageId, newText) {
        const msg = this.messages.find(m => m.id === messageId);
        if (msg) {
            msg.updateText(newText);
            this.save();
            return msg;
        }
        return null;
    }

    /**
     * Delete a message from this conversation
     * @param {string} messageId
     * @returns {Message|null} - The deleted message, or null if not found
     */
    deleteMessage(messageId) {
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index >= 0) {
            const [deleted] = this.messages.splice(index, 1);
            this.save();
            return deleted;
        }
        return null;
    }

    /**
     * Get a message by ID
     * @param {string} messageId
     * @returns {Message|null}
     */
    getMessage(messageId) {
        return this.messages.find(m => m.id === messageId) || null;
    }

    /**
     * Get the system message if it exists
     * @returns {Message|null}
     */
    getSystemMessage() {
        return this.messages.find(m => m.role === 'system') || null;
    }

    /**
     * Set or update the system message
     * @param {string} text
     * @returns {Message}
     */
    setSystemMessage(text) {
        let systemMsg = this.getSystemMessage();
        if (text.trim()) {
            if (systemMsg) {
                systemMsg.text = text;
                systemMsg.originalText = text;
            } else {
                systemMsg = new Message({
                    id: 'system-' + Date.now(),
                    text,
                    role: 'system'
                });
                this.messages.unshift(systemMsg);
            }
        } else if (systemMsg) {
            // Remove empty system message
            this.messages = this.messages.filter(m => m.id !== systemMsg.id);
            systemMsg = null;
        }
        this.save();
        return systemMsg;
    }

    /**
     * Get count of non-system messages
     * @returns {number}
     */
    getMessageCount() {
        return this.messages.filter(m => m.role !== 'system').length;
    }

    /**
     * Get the last message
     * @returns {Message|null}
     */
    getLastMessage() {
        return this.messages.length > 0 ? this.messages[this.messages.length - 1] : null;
    }

    /**
     * Update the origin of this conversation
     * @param {ConversationOrigin} origin
     * @returns {Conversation}
     */
    updateOrigin(origin) {
        this.origin = { ...origin };
        return this.save();
    }

    /**
     * Get origin label for display
     * @returns {string}
     */
    getOriginLabel() {
        if (!this.origin) return 'new';
        switch (this.origin.type) {
            case 'version': return `from ${this.origin.sourceId}`;
            case 'branch': return '↳ branch';
            default: return 'new';
        }
    }

    /**
     * Get detailed origin info for display
     * @returns {{label: string, tooltip: string}}
     */
    getOriginInfo() {
        if (!this.origin) {
            return { label: 'new', tooltip: 'Fresh conversation' };
        }
        
        switch (this.origin.type) {
            case 'version':
                return {
                    label: `from ${this.origin.sourceId}`,
                    tooltip: `Created from version ${this.origin.sourceId}`
                };
            case 'branch':
                return {
                    label: '↳ branch',
                    tooltip: 'Branched from another conversation'
                };
            case 'fresh':
            default:
                return {
                    label: 'new',
                    tooltip: 'Fresh conversation'
                };
        }
    }

    /**
     * Create a branch of this conversation at a specific message
     * @param {string} atMessageId
     * @returns {Conversation}
     */
    branch(atMessageId) {
        const messageIndex = this.messages.findIndex(m => m.id === atMessageId);
        if (messageIndex === -1) return null;

        // Copy messages up to and including the branch point
        const branchedMessages = this.messages.slice(0, messageIndex + 1).map(m => 
            new Message({
                text: m.text,
                role: m.role,
                timestamp: m.timestamp
            })
        );

        return Conversation.create(this.promptId, {
            messages: branchedMessages,
            config: { ...this.config },
            origin: {
                type: 'branch',
                sourceId: this.id,
                atMessageId: atMessageId
            }
        });
    }

    /**
     * Convert to plain object for serialization
     * @returns {Object}
     */
    toData() {
        return {
            id: this.id,
            promptId: this.promptId,
            messages: this.messages.map(m => m instanceof Message ? m.toData() : m),
            config: this.config,
            origin: this.origin,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

