/**
 * PromptHeader - Displays and allows editing of prompt name
 */
import { Prompt } from '../models/Prompt.js';
import { state } from '../core/State.js';

export class PromptHeader {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.headerEl
     * @param {HTMLElement} options.nameDisplayEl
     * @param {Function} [options.onRename] - (promptId, newName) => void
     */
    constructor({ headerEl, nameDisplayEl, onRename }) {
        this.headerEl = headerEl;
        this.nameDisplayEl = nameDisplayEl;
        this.onRename = onRename;
        
        this._bindEvents();
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Prompt name editing
        this.nameDisplayEl.addEventListener('blur', () => {
            const newName = this.nameDisplayEl.textContent.trim();
            const promptId = state.get('currentPromptId');
            if (newName && promptId) {
                if (this.onRename) {
                    this.onRename(promptId, newName);
                }
            }
        });
        
        this.nameDisplayEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.nameDisplayEl.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                const prompt = Prompt.get(state.get('currentPromptId'));
                if (prompt) {
                    this.nameDisplayEl.textContent = prompt.name;
                }
                this.nameDisplayEl.blur();
            }
        });
    }

    /**
     * Update the header with prompt info
     * @param {Prompt|null} prompt
     */
    update(prompt) {
        if (!prompt) {
            this.headerEl.style.display = 'none';
            return;
        }
        
        this.headerEl.style.display = 'block';
        this.nameDisplayEl.textContent = prompt.name;
    }

    /**
     * Refresh from current state
     */
    refresh() {
        const promptId = state.get('currentPromptId');
        const prompt = promptId ? Prompt.get(promptId) : null;
        this.update(prompt);
    }
}

