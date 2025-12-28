/**
 * SystemPromptPanel - Pinned system prompt display and editor
 */
import { renderMarkdown } from '../utils/markdown.js';
import { createElement, autoResizeTextarea } from '../utils/dom.js';

export class SystemPromptPanel {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.headerEl - The header element (clickable to expand/collapse)
     * @param {HTMLElement} options.contentEl - The content container
     * @param {HTMLElement} options.displayEl - The display element inside content
     * @param {HTMLElement} options.previewEl - The preview element in header
     * @param {HTMLElement} options.toggleEl - The toggle arrow element
     * @param {Function} [options.onSave] - (text) => void
     * @param {Function} [options.onStartEdit] - () => void
     * @param {Function} [options.onCancelEdit] - () => void
     */
    constructor({ headerEl, contentEl, displayEl, previewEl, toggleEl, onSave, onStartEdit, onCancelEdit }) {
        this.headerEl = headerEl;
        this.contentEl = contentEl;
        this.displayEl = displayEl;
        this.previewEl = previewEl;
        this.toggleEl = toggleEl;
        this.onSave = onSave;
        this.onStartEdit = onStartEdit;
        this.onCancelEdit = onCancelEdit;
        
        this.isExpanded = false;
        this.isEditing = false;
        this.currentText = '';
        this.messageId = null;
        
        this._bindEvents();
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Header click toggles expand/collapse
        this.headerEl.addEventListener('click', (e) => {
            // Don't toggle if clicking inside the display area
            if (e.target.closest('.system-prompt-pinned-display')) return;
            this.toggle();
        });
    }

    /**
     * Render the system prompt
     * @param {Object|null} systemMessage - The system message object or null
     * @param {boolean} [isEditing=false]
     */
    render(systemMessage, isEditing = false) {
        this.currentText = systemMessage?.text || '';
        this.messageId = systemMessage?.id || null;
        this.isEditing = isEditing;
        
        // Update preview
        this._updatePreview();
        
        if (isEditing) {
            this._renderEditMode();
        } else {
            this._renderDisplayMode();
        }
    }

    /**
     * Update the preview text in the header
     * @private
     */
    _updatePreview() {
        if (!this.previewEl) return;
        
        if (this.currentText.trim()) {
            const preview = this.currentText.length > 60 
                ? this.currentText.slice(0, 60) + '...' 
                : this.currentText;
            this.previewEl.textContent = preview;
            this.previewEl.className = 'system-prompt-preview';
        } else {
            this.previewEl.textContent = 'None';
            this.previewEl.className = 'system-prompt-preview system-prompt-empty';
        }
    }

    /**
     * Render edit mode with textarea
     * @private
     */
    _renderEditMode() {
        if (this.onStartEdit) this.onStartEdit();
        
        // Check if already has textarea
        const existingTextarea = this.displayEl.querySelector('textarea');
        if (existingTextarea) {
            this.expand();
            return;
        }
        
        this.displayEl.innerHTML = '';
        
        const textarea = createElement('textarea', 'system-prompt-input-field');
        textarea.value = this.currentText;
        textarea.rows = Math.max(3, Math.min(8, this.currentText.split('\n').length || 3));
        textarea.placeholder = 'Enter system prompt...';
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.save(textarea.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancelEdit();
            }
        });
        
        textarea.addEventListener('input', () => autoResizeTextarea(textarea));
        
        this.displayEl.appendChild(textarea);
        this.expand();
        textarea.focus();
    }

    /**
     * Render display mode
     * @private
     */
    _renderDisplayMode() {
        // Remove textarea if exists
        const existingTextarea = this.displayEl.querySelector('textarea');
        if (existingTextarea) {
            existingTextarea.remove();
        }
        
        if (this.currentText.trim()) {
            this.displayEl.innerHTML = renderMarkdown(this.currentText);
            this.displayEl.className = 'system-prompt-pinned-display';
        } else {
            this.displayEl.textContent = 'Click to add system prompt...';
            this.displayEl.className = 'system-prompt-pinned-display system-prompt-empty';
        }
        
        // Make clickable to edit
        this.displayEl.style.cursor = 'pointer';
        
        // Remove old listener and add new one
        const newDisplayEl = this.displayEl.cloneNode(true);
        this.displayEl.parentNode.replaceChild(newDisplayEl, this.displayEl);
        this.displayEl = newDisplayEl;
        
        this.displayEl.addEventListener('click', (e) => {
            e.stopPropagation();
            this.startEdit();
        });
    }

    /**
     * Toggle expand/collapse
     */
    toggle() {
        if (this.isExpanded) {
            this.collapse();
        } else {
            this.expand();
        }
    }

    /**
     * Expand the content
     */
    expand() {
        this.isExpanded = true;
        this.contentEl.style.display = 'block';
        if (this.toggleEl) {
            this.toggleEl.textContent = '▲';
        }
    }

    /**
     * Collapse the content
     */
    collapse() {
        this.isExpanded = false;
        this.contentEl.style.display = 'none';
        if (this.toggleEl) {
            this.toggleEl.textContent = '▼';
        }
    }

    /**
     * Start editing
     */
    startEdit() {
        if (this.isEditing) return;
        this.isEditing = true;
        this._renderEditMode();
    }

    /**
     * Save the edit
     * @param {string} newText
     */
    save(newText) {
        const trimmedText = newText.trim();
        this.currentText = trimmedText;
        this.isEditing = false;
        
        if (this.onSave) {
            this.onSave(trimmedText);
        }
        
        this._updatePreview();
        this._renderDisplayMode();
    }

    /**
     * Cancel the edit
     */
    cancelEdit() {
        this.isEditing = false;
        if (this.onCancelEdit) this.onCancelEdit();
        this._renderDisplayMode();
    }

    /**
     * Get the current text value (for saving during edit)
     * @returns {string|null}
     */
    getCurrentEditValue() {
        const textarea = this.displayEl.querySelector('textarea');
        return textarea ? textarea.value : null;
    }
}

