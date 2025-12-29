/**
 * MessageRenderer - Renders a single message
 * Handles: display mode, edit mode, actions (branch, delete)
 */
import { Message } from '../models/Message.js';
import { renderMarkdown } from '../utils/markdown.js';
import { formatTime } from '../utils/datetime.js';
import { createElement, autoResizeTextarea } from '../utils/dom.js';

export class MessageRenderer {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.container - Parent element to render into
     * @param {Message|Object} options.message - Message object
     * @param {'text'|'json'} [options.responseMode='text'] - Response mode for assistant messages
     * @param {Function} [options.onEdit] - (messageId, newText) => void
     * @param {Function} [options.onDelete] - (messageId) => void
     * @param {Function} [options.onBranch] - (messageId) => void
     * @param {Function} [options.onStartEdit] - (messageId) => void
     * @param {Function} [options.onCancelEdit] - (messageId) => void
     */
    constructor({ container, message, responseMode = 'text', onEdit, onDelete, onBranch, onStartEdit, onCancelEdit }) {
        this.container = container;
        this.message = message instanceof Message ? message : Message.fromData(message);
        this.responseMode = responseMode;
        this.onEdit = onEdit;
        this.onDelete = onDelete;
        this.onBranch = onBranch;
        this.onStartEdit = onStartEdit;
        this.onCancelEdit = onCancelEdit;
        this.isEditing = false;
        this.element = null;
    }

    /**
     * Render the message (creates or updates the element)
     * @param {boolean} [isEditing=false]
     * @returns {HTMLElement}
     */
    render(isEditing = false) {
        this.isEditing = isEditing;
        
        // System messages are handled separately
        if (this.message.role === 'system') {
            return null;
        }

        // Find or create the message element
        let messageDiv = this.container.querySelector(`[data-message-id="${this.message.id}"]`);
        
        if (!messageDiv) {
            messageDiv = createElement('div', `message ${this.message.role}`);
            messageDiv.dataset.messageId = this.message.id;
            this.container.appendChild(messageDiv);
        } else {
            messageDiv.innerHTML = '';
            messageDiv.className = `message ${this.message.role}${isEditing ? ' editing' : ''}`;
        }

        this.element = messageDiv;

        // Avatar
        const avatar = createElement('div', 'message-avatar');
        avatar.textContent = this.message.role === 'user' ? 'U' : 'AI';

        // Content container
        const content = createElement('div', isEditing ? 'message-content message-content-editing' : 'message-content');

        if (isEditing) {
            this._renderEditMode(content);
        } else {
            this._renderDisplayMode(content);
        }

        // Footer with timestamp
        const footer = createElement('div', 'message-footer');
        const timestamp = createElement('div', 'message-timestamp');
        timestamp.textContent = formatTime(this.message.getDate());
        footer.appendChild(timestamp);
        content.appendChild(footer);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);

        return messageDiv;
    }

    /**
     * Render edit mode with textarea
     * @private
     */
    _renderEditMode(content) {
        const textarea = createElement('textarea', 'message-edit-textarea');
        textarea.value = this.message.text;
        textarea.rows = Math.max(3, Math.min(10, this.message.text.split('\n').length));

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.saveEdit(textarea.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEdit();
            }
        });

        textarea.addEventListener('input', () => autoResizeTextarea(textarea));

        content.appendChild(textarea);
        
        // Focus textarea after render
        setTimeout(() => textarea.focus(), 0);
    }

    /**
     * Render display mode with formatted text
     * @private
     */
    _renderDisplayMode(content) {
        const textDiv = createElement('div', 'message-text');
        const isAssistant = this.message.role === 'assistant';

        if (isAssistant && this.responseMode === 'json') {
            this._renderJsonContent(textDiv);
        } else {
            this._renderTextContent(textDiv);
        }

        content.appendChild(textDiv);

        // Add action buttons
        const actions = createElement('div', 'message-actions');
        
        // Branch button
        const branchBtn = createElement('button', 'message-action-btn');
        branchBtn.title = 'Branch from here';
        branchBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 3V8M4 8C4 9.10457 4.89543 10 6 10H8M4 8C4 9.10457 3.10457 10 2 10M10 10V8C10 6.89543 9.10457 6 8 6H6M10 10L12 8M10 10L8 8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        branchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onBranch) this.onBranch(this.message.id);
        });

        // Delete button
        const deleteBtn = createElement('button', 'message-action-btn');
        deleteBtn.title = 'Delete message';
        deleteBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 3.5V2.5C5.5 2.22386 5.72386 2 6 2H8C8.27614 2 8.5 2.22386 8.5 2.5V3.5M11.5 3.5H2.5M10.5 3.5V11.5C10.5 12.0523 10.0523 12.5 9.5 12.5H4.5C3.94772 12.5 3.5 12.0523 3.5 11.5V3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.onDelete) this.onDelete(this.message.id);
        });

        actions.appendChild(branchBtn);
        actions.appendChild(deleteBtn);
        content.appendChild(actions);
    }

    /**
     * Render JSON content for assistant messages
     * @private
     */
    _renderJsonContent(textDiv) {
        const jsonContainer = createElement('div', 'json-message-container');
        
        const toolbar = createElement('div', 'json-message-toolbar');
        const label = createElement('span');
        label.textContent = 'JSON view';
        toolbar.appendChild(label);
        jsonContainer.appendChild(toolbar);

        const body = createElement('pre', 'json-message-body');

        try {
            const parsed = JSON.parse(this.message.text);
            body.textContent = JSON.stringify(parsed, null, 2);
        } catch {
            const errorBanner = createElement('div', 'json-message-error');
            errorBanner.textContent = 'Response is not valid JSON. Showing raw output.';
            jsonContainer.appendChild(errorBanner);
            body.textContent = this.message.text;
        }

        jsonContainer.appendChild(body);
        textDiv.appendChild(jsonContainer);

        // Make clickable to edit
        textDiv.style.cursor = 'pointer';
        jsonContainer.style.cursor = 'pointer';
        body.style.cursor = 'default';
        
        textDiv.addEventListener('click', (e) => {
            if (e.target === textDiv || e.target === jsonContainer || e.target === toolbar) {
                this.startEdit();
            }
        });
    }

    /**
     * Render text/markdown content
     * @private
     */
    _renderTextContent(textDiv) {
        const isUserMessage = this.message.role === 'user';
        const lineCount = this.message.text.split('\n').length;
        const charCount = this.message.text.length;
        const isLongMessage = isUserMessage && (lineCount > 4 || charCount > 300);

        if (isLongMessage) {
            const contentWrapper = createElement('div', 'message-text-content truncated');
            contentWrapper.innerHTML = renderMarkdown(this.message.text);
            textDiv.appendChild(contentWrapper);

            const readMoreBtn = createElement('button', 'read-more-btn');
            readMoreBtn.textContent = 'read more...';
            readMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = contentWrapper.classList.toggle('expanded');
                contentWrapper.classList.toggle('truncated', !isExpanded);
                readMoreBtn.textContent = isExpanded ? 'show less' : 'read more...';
            });
            textDiv.appendChild(readMoreBtn);
        } else {
            textDiv.innerHTML = renderMarkdown(this.message.text);
        }

        // Make clickable to edit
        textDiv.style.cursor = 'pointer';
        textDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('read-more-btn')) return;
            this.startEdit();
        });
    }

    /**
     * Start editing this message
     */
    startEdit() {
        if (this.isEditing) return;
        if (this.onStartEdit) this.onStartEdit(this.message.id);
        this.render(true);
    }

    /**
     * Save the edit
     * @param {string} newText
     */
    saveEdit(newText) {
        const trimmedText = newText.trim();
        if (trimmedText !== this.message.text) {
            if (this.onEdit) this.onEdit(this.message.id, trimmedText);
        } else {
            this.cancelEdit();
        }
    }

    /**
     * Cancel the edit
     */
    cancelEdit() {
        if (this.onCancelEdit) this.onCancelEdit(this.message.id);
        this.render(false);
    }

    /**
     * Update the message and re-render
     * @param {Message|Object} message
     */
    update(message) {
        this.message = message instanceof Message ? message : Message.fromData(message);
        this.render(this.isEditing);
    }

    /**
     * Remove the element from DOM
     */
    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.remove();
        }
        this.element = null;
    }
}

