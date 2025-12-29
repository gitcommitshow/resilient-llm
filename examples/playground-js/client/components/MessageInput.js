/**
 * MessageInput - Handles message input area with role toggle
 */
import { autoResizeTextarea } from '../utils/dom.js';

export class MessageInput {
    /**
     * @param {Object} options
     * @param {HTMLTextAreaElement} options.inputEl
     * @param {HTMLButtonElement} options.sendButton
     * @param {HTMLElement} options.roleToggle
     * @param {Function} [options.onSend] - (text, role) => void
     * @param {Function} [options.onRoleChange] - (role) => void
     */
    constructor({ inputEl, sendButton, roleToggle, onSend, onRoleChange }) {
        this.inputEl = inputEl;
        this.sendButton = sendButton;
        this.roleToggle = roleToggle;
        this.onSend = onSend;
        this.onRoleChange = onRoleChange;
        
        this.currentRole = 'user';
        
        this._bindEvents();
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Send button
        this.sendButton.addEventListener('click', () => this._handleSend());
        
        // Input auto-resize
        this.inputEl.addEventListener('input', () => {
            autoResizeTextarea(this.inputEl);
        });
        
        // Enter key to send
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._handleSend();
            }
        });
        
        // Role toggle
        this.roleToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.role-toggle-btn');
            if (!btn) return;
            this.setRole(btn.dataset.role);
        });
    }

    /**
     * Handle send action
     * @private
     */
    _handleSend() {
        const text = this.inputEl.value.trim();
        if (!text) return;
        
        if (this.onSend) {
            this.onSend(text, this.currentRole);
        }
        
        this.inputEl.value = '';
        autoResizeTextarea(this.inputEl);
    }

    /**
     * Set the current role
     * @param {'user'|'assistant'} role
     */
    setRole(role) {
        this.currentRole = role;
        
        // Update toggle buttons
        this.roleToggle.querySelectorAll('.role-toggle-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.role === role);
        });
        
        // Update placeholder
        this.inputEl.placeholder = role === 'assistant' 
            ? 'Type assistant response...' 
            : 'Type your message...';
        
        if (this.onRoleChange) {
            this.onRoleChange(role);
        }
    }

    /**
     * Get the current role
     * @returns {'user'|'assistant'}
     */
    getRole() {
        return this.currentRole;
    }

    /**
     * Focus the input
     */
    focus() {
        this.inputEl.focus();
    }

    /**
     * Disable the input
     * @param {boolean} disabled
     */
    setDisabled(disabled) {
        this.inputEl.disabled = disabled;
        this.sendButton.disabled = disabled;
    }

    /**
     * Clear the input
     */
    clear() {
        this.inputEl.value = '';
        autoResizeTextarea(this.inputEl);
    }
}

