/**
 * Prompt class - represents a workspace/prompt collection
 */
import { Storage } from '../core/Storage.js';

export class Prompt {
    /**
     * @param {Object} data
     * @param {string} [data.id] - Auto-generated if not provided
     * @param {string} [data.name]
     * @param {string|null} [data.bestVersionId]
     * @param {string} [data.createdAt]
     * @param {string} [data.updatedAt]
     */
    constructor({ id, name = 'New Prompt', bestVersionId = null, createdAt, updatedAt }) {
        this.id = id || Prompt.generateId();
        this.name = name;
        this.bestVersionId = bestVersionId;
        const now = new Date().toISOString();
        this.createdAt = createdAt || now;
        this.updatedAt = updatedAt || now;
    }

    /**
     * Generate a unique ID
     * @returns {string}
     */
    static generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    /**
     * Create a new Prompt instance and save to storage
     * @param {string} [name]
     * @returns {Prompt}
     */
    static create(name = 'New Prompt') {
        return new Prompt({ name }).save();
    }

    /**
     * Load a Prompt from storage
     * @param {string} id
     * @returns {Prompt|null}
     */
    static get(id) {
        const data = Storage.get('prompts').find(p => p.id === id);
        return data ? Prompt.fromData(data) : null;
    }

    /**
     * Create from plain object (deserialization)
     * @param {Object} data
     * @returns {Prompt}
     */
    static fromData(data) {
        return new Prompt(data);
    }

    /**
     * Save this prompt to storage
     * @returns {Prompt}
     */
    save() {
        this.updatedAt = new Date().toISOString();
        const all = Storage.get('prompts');
        const index = all.findIndex(p => p.id === this.id);
        if (index >= 0) {
            all[index] = this.toData();
        } else {
            all.push(this.toData());
        }
        Storage.set('prompts', all);
        return this;
    }

    /**
     * Update prompt properties
     * @param {Object} updates
     * @returns {Prompt}
     */
    update(updates) {
        if (updates.name !== undefined) this.name = updates.name;
        if (updates.bestVersionId !== undefined) this.bestVersionId = updates.bestVersionId;
        return this.save();
    }

    /**
     * Delete this prompt from storage (and related versions/conversations)
     */
    delete() {
        const all = Storage.get('prompts').filter(p => p.id !== this.id);
        Storage.set('prompts', all);
        
        // Also delete related versions and conversations
        const versions = Storage.get('versions').filter(v => v.promptId !== this.id);
        Storage.set('versions', versions);
        
        const conversations = Storage.get('conversations').filter(c => c.promptId !== this.id);
        Storage.set('conversations', conversations);
    }

    /**
     * Get all prompts sorted by updatedAt (most recent first)
     * @returns {Prompt[]}
     */
    static list() {
        return Storage.get('prompts')
            .map(p => Prompt.fromData(p))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    /**
     * Generate a name from messages
     * @param {Array} messages - Array of message objects
     * @returns {string}
     */
    static generateNameFromMessages(messages) {
        const userMsg = messages?.find(m => m.role === 'user');
        if (userMsg?.text) {
            const text = userMsg.text;
            return text.slice(0, 35) + (text.length > 35 ? '...' : '');
        }
        const systemMsg = messages?.find(m => m.role === 'system');
        if (systemMsg?.text?.trim()) {
            const text = systemMsg.text.trim();
            return text.slice(0, 35) + (text.length > 35 ? '...' : '');
        }
        const now = new Date();
        return `Prompt ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    /**
     * Set the best version for this prompt
     * @param {string|null} versionId - null to reset to "latest is best"
     * @returns {Prompt}
     */
    setBestVersion(versionId) {
        this.bestVersionId = versionId;
        return this.save();
    }

    /**
     * Convert to plain object for serialization
     * @returns {Object}
     */
    toData() {
        return {
            id: this.id,
            name: this.name,
            bestVersionId: this.bestVersionId,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }
}

