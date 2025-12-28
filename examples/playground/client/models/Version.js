/**
 * Version class - represents an immutable snapshot of a conversation
 */
import { Storage } from '../core/Storage.js';
import { Message } from './Message.js';
import { Prompt } from './Prompt.js';

export class Version {
    /**
     * @param {Object} data
     * @param {string} data.id - e.g., 'v1', 'v2'
     * @param {string} data.promptId
     * @param {Message[]|Object[]} data.messages
     * @param {Object} data.config
     * @param {string|null} [data.parentVersionId]
     * @param {string} [data.notes]
     * @param {string} [data.createdAt]
     */
    constructor({ id, promptId, messages, config, parentVersionId = null, notes = '', createdAt }) {
        this.id = id;
        this.promptId = promptId;
        this.messages = (messages || []).map(m => m instanceof Message ? m : Message.fromData(m));
        this.config = { ...config };
        this.parentVersionId = parentVersionId;
        this.notes = notes;
        this.createdAt = createdAt || new Date().toISOString();
    }

    /**
     * Create a new Version from conversation data and save to storage
     * @param {string} promptId
     * @param {Object} options
     * @param {Message[]|Object[]} options.messages
     * @param {Object} options.config
     * @param {string|null} [options.parentVersionId]
     * @param {string} [options.notes]
     * @returns {Version}
     */
    static create(promptId, { messages, config, parentVersionId = null, notes = '' }) {
        const existing = Version.listByPrompt(promptId);
        const versionNumber = existing.length + 1;
        const id = `v${versionNumber}`;

        const version = new Version({
            id,
            promptId,
            messages: (messages || []).map(m => m instanceof Message ? m : Message.fromData(m)),
            config: { ...config },
            parentVersionId,
            notes
        });

        // Save and update prompt's updatedAt
        version.save();
        const prompt = Prompt.get(promptId);
        if (prompt) {
            prompt.save(); // This updates the timestamp
        }

        return version;
    }

    /**
     * Load a Version from storage
     * @param {string} id
     * @param {string} promptId
     * @returns {Version|null}
     */
    static get(id, promptId) {
        const data = Storage.get('versions').find(v => v.id === id && v.promptId === promptId);
        return data ? Version.fromData(data) : null;
    }

    /**
     * Create from plain object (deserialization)
     * @param {Object} data
     * @returns {Version}
     */
    static fromData(data) {
        return new Version(data);
    }

    /**
     * Save this version to storage
     * @returns {Version}
     */
    save() {
        const all = Storage.get('versions');
        const index = all.findIndex(v => v.id === this.id && v.promptId === this.promptId);
        if (index >= 0) {
            all[index] = this.toData();
        } else {
            all.push(this.toData());
        }
        Storage.set('versions', all);
        return this;
    }

    /**
     * Delete this version from storage
     */
    delete() {
        const all = Storage.get('versions').filter(
            v => !(v.id === this.id && v.promptId === this.promptId)
        );
        Storage.set('versions', all);
    }

    /**
     * Get all versions for a prompt, sorted by version number
     * @param {string} promptId
     * @returns {Version[]}
     */
    static listByPrompt(promptId) {
        return Storage.get('versions')
            .filter(v => v.promptId === promptId)
            .map(v => Version.fromData(v))
            .sort((a, b) => {
                const numA = parseInt(a.id.replace('v', ''), 10);
                const numB = parseInt(b.id.replace('v', ''), 10);
                return numA - numB;
            });
    }

    /**
     * Get count of non-system messages
     * @returns {number}
     */
    getMessageCount() {
        return this.messages.filter(m => m.role !== 'system').length;
    }

    /**
     * Check if this is the best version for its prompt
     * @returns {boolean}
     */
    isBestVersion() {
        const best = Version.getBestVersion(this.promptId);
        return best ? best.id === this.id : false;
    }

    /**
     * Get the best version for a prompt (explicitly marked or latest)
     * @param {string} promptId
     * @returns {Version|null}
     */
    static getBestVersion(promptId) {
        const prompt = Prompt.get(promptId);
        if (!prompt) return null;

        const versions = Version.listByPrompt(promptId);
        if (versions.length === 0) return null;

        if (prompt.bestVersionId) {
            const best = versions.find(v => v.id === prompt.bestVersionId);
            if (best) return best;
        }

        // Default to latest
        return versions[versions.length - 1];
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
            parentVersionId: this.parentVersionId,
            notes: this.notes,
            createdAt: this.createdAt
        };
    }
}

