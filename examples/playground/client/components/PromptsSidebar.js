/**
 * PromptsSidebar - Left sidebar showing all prompts
 */
import { Prompt } from '../models/Prompt.js';
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';
import { formatRelativeTime } from '../utils/datetime.js';
import { createElement } from '../utils/dom.js';

export class PromptsSidebar {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - The prompts list container
     * @param {string} [options.activePromptId] - Currently active prompt ID
     * @param {Function} [options.onSelectPrompt] - (promptId) => void
     * @param {Function} [options.onDeletePrompt] - (promptId) => void
     */
    constructor({ container, activePromptId, onSelectPrompt, onDeletePrompt }) {
        this.container = container;
        this.activePromptId = activePromptId;
        this.onSelectPrompt = onSelectPrompt;
        this.onDeletePrompt = onDeletePrompt;
    }

    /**
     * Set the active prompt ID
     * @param {string} promptId
     */
    setActivePrompt(promptId) {
        this.activePromptId = promptId;
    }

    /**
     * Refresh the prompts list
     */
    refresh() {
        this.container.innerHTML = '';
        
        const prompts = Prompt.list();

        prompts.forEach((prompt) => {
            const promptItem = createElement('button', 
                `prompt-item ${prompt.id === this.activePromptId ? 'active' : ''}`
            );
            promptItem.onclick = () => {
                if (this.onSelectPrompt) this.onSelectPrompt(prompt.id);
            };

            // Icon
            const icon = createElement('span', 'prompt-icon');
            icon.textContent = '📝';

            // Info section
            const info = createElement('div', 'prompt-info');

            const name = createElement('div', 'prompt-name');
            name.textContent = prompt.name;

            const meta = createElement('div', 'prompt-meta');
            const versions = Version.listByPrompt(prompt.id);
            const conversations = Conversation.listByPrompt(prompt.id);
            const versionText = versions.length > 0 ? `${versions.length}v` : '';
            const convText = conversations.length > 0 ? `${conversations.length}c` : '';
            const separator = versionText && convText ? ' · ' : '';
            meta.textContent = `${versionText}${separator}${convText} • ${formatRelativeTime(prompt.updatedAt || prompt.createdAt)}`;

            info.appendChild(name);
            info.appendChild(meta);

            // Delete indicator (shows on hover)
            const indicator = createElement('span', 'prompt-indicator');
            indicator.title = 'Delete prompt';
            indicator.onclick = (e) => {
                e.stopPropagation();
                if (this.onDeletePrompt) this.onDeletePrompt(prompt.id);
            };

            promptItem.appendChild(icon);
            promptItem.appendChild(info);
            promptItem.appendChild(indicator);
            this.container.appendChild(promptItem);
        });
    }
}

