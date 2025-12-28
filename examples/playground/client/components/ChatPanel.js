/**
 * ChatPanel - Complete chat panel component
 * Contains: header, version bar, system prompt, messages, input
 * Can be instantiated multiple times for multi-panel support
 */
import { MessageRenderer } from './MessageRenderer.js';
import { SystemPromptPanel } from './SystemPromptPanel.js';
import { VersionBar } from './VersionBar.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { Version } from '../models/Version.js';
import { scrollToBottom, createElement } from '../utils/dom.js';

export class ChatPanel {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.messagesContainer
     * @param {HTMLElement} options.emptyStateEl
     * @param {HTMLElement} options.versionsContainer
     * @param {HTMLElement} options.conversationsContainer
     * @param {HTMLElement} options.systemPromptHeader
     * @param {HTMLElement} options.systemPromptContent
     * @param {HTMLElement} options.systemPromptDisplay
     * @param {HTMLElement} options.systemPromptPreview
     * @param {HTMLElement} options.systemPromptToggle
     * @param {string} [options.panelId]
     * @param {string} [options.promptId]
     * @param {string} [options.conversationId]
     * @param {'text'|'json'} [options.responseMode='text']
     * @param {Function} [options.onSendMessage] - (panelId, { text, role }) => void
     * @param {Function} [options.onEditMessage] - (panelId, messageId, newText) => void
     * @param {Function} [options.onDeleteMessage] - (panelId, messageId) => void
     * @param {Function} [options.onBranchAtMessage] - (panelId, messageId) => void
     * @param {Function} [options.onSaveVersion] - (panelId, notes) => void
     * @param {Function} [options.onSwitchConversation] - (panelId, conversationId) => void
     * @param {Function} [options.onLoadVersion] - (panelId, versionId) => void
     * @param {Function} [options.onNewConversation] - (panelId) => void
     * @param {Function} [options.onDeleteConversation] - (panelId, conversationId) => void
     * @param {Function} [options.onDeleteVersion] - (panelId, versionId) => void
     * @param {Function} [options.onSystemPromptChange] - (panelId, text) => void
     * @param {Function} [options.onEditingStateChange] - (messageId) => void
     */
    constructor(options) {
        this.panelId = options.panelId || 'default';
        this.promptId = options.promptId;
        this.conversationId = options.conversationId;
        this.responseMode = options.responseMode || 'text';
        
        // DOM elements
        this.messagesContainer = options.messagesContainer;
        this.emptyStateEl = options.emptyStateEl;
        
        // Callbacks
        this.onSendMessage = options.onSendMessage;
        this.onEditMessage = options.onEditMessage;
        this.onDeleteMessage = options.onDeleteMessage;
        this.onBranchAtMessage = options.onBranchAtMessage;
        this.onSaveVersion = options.onSaveVersion;
        this.onSwitchConversation = options.onSwitchConversation;
        this.onLoadVersion = options.onLoadVersion;
        this.onNewConversation = options.onNewConversation;
        this.onDeleteConversation = options.onDeleteConversation;
        this.onDeleteVersion = options.onDeleteVersion;
        this.onSystemPromptChange = options.onSystemPromptChange;
        this.onEditingStateChange = options.onEditingStateChange;
        
        // Message renderers map
        this.messageRenderers = new Map();
        
        // Currently editing message ID
        this.editingMessageId = null;
        
        // Flag to prevent recursive calls during edit operations
        this._isProcessingEdit = false;
        
        // In-memory messages array
        this.messages = [];
        
        // Initialize sub-components
        this.versionBar = new VersionBar({
            versionsContainer: options.versionsContainer,
            conversationsContainer: options.conversationsContainer,
            promptId: this.promptId,
            activeConversationId: this.conversationId,
            onLoadVersion: (versionId) => {
                if (this.onLoadVersion) this.onLoadVersion(this.panelId, versionId);
            },
            onSwitchConversation: (conversationId) => {
                if (this.onSwitchConversation) this.onSwitchConversation(this.panelId, conversationId);
            },
            onDeleteVersion: (versionId) => {
                if (this.onDeleteVersion) this.onDeleteVersion(this.panelId, versionId);
            },
            onDeleteConversation: (conversationId) => {
                if (this.onDeleteConversation) this.onDeleteConversation(this.panelId, conversationId);
            },
            onNewConversation: () => {
                if (this.onNewConversation) this.onNewConversation(this.panelId);
            }
        });
        
        this.systemPromptPanel = new SystemPromptPanel({
            headerEl: options.systemPromptHeader,
            contentEl: options.systemPromptContent,
            displayEl: options.systemPromptDisplay,
            previewEl: options.systemPromptPreview,
            toggleEl: options.systemPromptToggle,
            onSave: (text) => {
                this._handleSystemPromptSave(text);
            },
            onStartEdit: () => {
                this._setEditingMessage('system-prompt');
            },
            onCancelEdit: () => {
                if (this.editingMessageId === 'system-prompt') {
                    this._setEditingMessage(null);
                }
            }
        });
    }

    /**
     * Load a conversation into this panel
     * @param {string} conversationId
     */
    loadConversation(conversationId) {
        this.conversationId = conversationId;
        this.versionBar.setActiveConversation(conversationId);
        
        const conversation = Conversation.get(conversationId);
        if (conversation) {
            this.promptId = conversation.promptId;
            this.versionBar.setPromptId(conversation.promptId);
            // Ensure we create a fresh array copy
            const conversationMessages = Array.isArray(conversation.messages) 
                ? conversation.messages 
                : [];
            this.messages = conversationMessages.map(m => 
                m instanceof Message ? m : Message.fromData(m)
            );
        } else {
            this.messages = [];
        }
        
        this.renderMessages();
        this.versionBar.refresh();
    }

    /**
     * Load messages from data
     * @param {Array} messagesData
     */
    loadMessages(messagesData) {
        this.messages = (messagesData || [])
            .filter(m => !(m.role === 'system' && !m.text?.trim()))
            .map(m => m instanceof Message ? m : Message.fromData(m));
        
        this.renderMessages();
    }

    /**
     * Render all messages to the UI
     */
    renderMessages() {
        // Clear existing renderers
        this.messageRenderers.forEach(renderer => renderer.destroy());
        this.messageRenderers.clear();
        
        this.messagesContainer.innerHTML = '';
        
        const hasContent = this.messages.length > 0 && 
            !(this.messages.length === 1 && this.messages[0].role === 'system' && !this.messages[0].text.trim());
        
        if (!hasContent) {
            this.messagesContainer.appendChild(this.emptyStateEl);
            this.emptyStateEl.classList.remove('hidden');
        } else {
            this.emptyStateEl.classList.add('hidden');
            
            // Check for version separator
            const conversation = this.conversationId ? Conversation.get(this.conversationId) : null;
            const versionOrigin = conversation?.origin?.type === 'version' ? conversation.origin : null;
            
            let versionMessageCount = versionOrigin?.versionMessageCount || 0;
            if (versionOrigin && !versionMessageCount && versionOrigin.sourceId) {
                const version = Version.get(versionOrigin.sourceId, this.promptId);
                if (version) {
                    versionMessageCount = version.getMessageCount();
                }
            }
            
            let nonSystemCount = 0;
            let separatorInserted = false;
            
            this.messages.forEach((message) => {
                if (message.role !== 'system') {
                    nonSystemCount++;
                    
                    // Insert separator after version boundary
                    if (!separatorInserted && versionOrigin && 
                        nonSystemCount === versionMessageCount + 1 && versionMessageCount > 0) {
                        const separator = createElement('div', 'version-separator');
                        separator.setAttribute('role', 'separator');
                        separator.setAttribute('aria-label', `Saved in ${versionOrigin.sourceId}`);
                        separator.innerHTML = `<span class="version-separator-label">Saved in ${versionOrigin.sourceId}</span>`;
                        this.messagesContainer.appendChild(separator);
                        separatorInserted = true;
                    }
                }
                
                this._renderMessage(message);
            });
        }
        
        // Update system prompt panel
        let systemMessage = null;
        if (Array.isArray(this.messages)) {
            for (let i = 0; i < this.messages.length; i++) {
                if (this.messages[i] && this.messages[i].role === 'system') {
                    systemMessage = this.messages[i];
                    break;
                }
            }
        }
        this.systemPromptPanel.render(systemMessage, false);
    }

    /**
     * Render a single message
     * @private
     */
    _renderMessage(message) {
        if (message.role === 'system') return;
        
        const renderer = new MessageRenderer({
            container: this.messagesContainer,
            message,
            responseMode: this.responseMode,
            onEdit: (messageId, newText) => this._handleMessageEdit(messageId, newText),
            onDelete: (messageId) => this._handleMessageDelete(messageId),
            onBranch: (messageId) => this._handleMessageBranch(messageId),
            onStartEdit: (messageId) => this._setEditingMessage(messageId),
            onCancelEdit: () => this._setEditingMessage(null)
        });
        
        const isEditing = this.editingMessageId === message.id;
        renderer.render(isEditing);
        this.messageRenderers.set(message.id, renderer);
    }

    /**
     * Add a message to the panel
     * @param {Object} messageData - { text, role }
     * @returns {Message}
     */
    addMessage(messageData) {
        // Check for version separator
        if (messageData.role !== 'system') {
            const conversation = this.conversationId ? Conversation.get(this.conversationId) : null;
            const versionOrigin = conversation?.origin?.type === 'version' ? conversation.origin : null;
            
            if (versionOrigin) {
                let versionMessageCount = versionOrigin.versionMessageCount || 0;
                if (!versionMessageCount && versionOrigin.sourceId) {
                    const version = Version.get(versionOrigin.sourceId, this.promptId);
                    if (version) {
                        versionMessageCount = version.getMessageCount();
                    }
                }
                
                // Count non-system messages using for loop instead of filter()
                let currentNonSystemCount = 0;
                if (Array.isArray(this.messages)) {
                    for (let i = 0; i < this.messages.length; i++) {
                        if (this.messages[i] && this.messages[i].role !== 'system') {
                            currentNonSystemCount++;
                        }
                    }
                }
                
                if (currentNonSystemCount === versionMessageCount && 
                    !this.messagesContainer.querySelector('.version-separator')) {
                    const separator = createElement('div', 'version-separator');
                    separator.setAttribute('role', 'separator');
                    separator.setAttribute('aria-label', `Saved in ${versionOrigin.sourceId}`);
                    separator.innerHTML = `<span class="version-separator-label">Saved in ${versionOrigin.sourceId}</span>`;
                    this.messagesContainer.appendChild(separator);
                }
            }
        }
        
        const message = new Message(messageData);
        this.messages.push(message);
        
        // Hide empty state
        this.emptyStateEl.classList.add('hidden');
        
        // Render the new message
        this._renderMessage(message);
        scrollToBottom(this.messagesContainer);
        
        return message;
    }

    /**
     * Update the response mode
     * @param {'text'|'json'} mode
     */
    setResponseMode(mode) {
        this.responseMode = mode;
        // Re-render assistant messages
        this.messages.forEach(msg => {
            if (msg.role === 'assistant') {
                const renderer = this.messageRenderers.get(msg.id);
                if (renderer) {
                    renderer.responseMode = mode;
                    renderer.render(renderer.isEditing);
                }
            }
        });
    }

    /**
     * Set the prompt ID
     * @param {string} promptId
     */
    setPromptId(promptId) {
        this.promptId = promptId;
        this.versionBar.setPromptId(promptId);
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const avatar = createElement('div', 'message-avatar');
        avatar.textContent = 'AI';
        
        const dots = createElement('div');
        dots.style.cssText = 'display:flex;gap:8px;align-items:center;padding:12px 16px;background:#f4f4f5;border-radius:8px;';
        
        for (let i = 0; i < 3; i++) {
            const dot = createElement('div', 'typing-dot');
            dots.appendChild(dot);
        }
        
        const messageDiv = createElement('div', 'message assistant');
        messageDiv.style.cssText = 'display:flex;align-items:flex-start;gap:12px;';
        messageDiv.id = 'typingIndicator';
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(dots);
        
        this.messagesContainer.appendChild(messageDiv);
        scrollToBottom(this.messagesContainer);
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const indicator = document.getElementById('typingIndicator');
        if (indicator) indicator.remove();
    }

    /**
     * Refresh the version bar
     */
    refreshVersionBar() {
        this.versionBar.refresh();
    }

    /**
     * Get the messages array
     * @returns {Message[]}
     */
    getMessages() {
        return this.messages;
    }

    /**
     * Get the system message
     * @returns {Message|null}
     */
    getSystemMessage() {
        if (!Array.isArray(this.messages)) return null;
        for (let i = 0; i < this.messages.length; i++) {
            if (this.messages[i] && this.messages[i].role === 'system') {
                return this.messages[i];
            }
        }
        return null;
    }

    /**
     * Handle system prompt save
     * @private
     */
    _handleSystemPromptSave(text) {
        // Prevent recursive calls
        if (this._isProcessingEdit) {
            console.warn('_handleSystemPromptSave called recursively, ignoring');
            return;
        }
        
        this._isProcessingEdit = true;
        
        try {
            const trimmedText = text.trim();
            
            // Ensure messages is a plain array
            if (!Array.isArray(this.messages)) {
                console.error('this.messages is not an array:', this.messages);
                this.messages = [];
            }
            
            // Find system message using for loop instead of find()
            let systemMsg = null;
            let systemMsgIndex = -1;
            for (let i = 0; i < this.messages.length; i++) {
                if (this.messages[i] && this.messages[i].role === 'system') {
                    systemMsg = this.messages[i];
                    systemMsgIndex = i;
                    break;
                }
            }
            
            if (trimmedText) {
                if (systemMsg) {
                    systemMsg.text = trimmedText;
                    systemMsg.originalText = trimmedText;
                } else {
                    systemMsg = new Message({
                        id: 'system-' + Date.now(),
                        text: trimmedText,
                        role: 'system'
                    });
                    this.messages.unshift(systemMsg);
                }
            } else if (systemMsg) {
                // Remove system message using for loop instead of filter()
                const newMessages = [];
                for (let i = 0; i < this.messages.length; i++) {
                    if (this.messages[i] && this.messages[i].id !== systemMsg.id) {
                        newMessages.push(this.messages[i]);
                    }
                }
                this.messages = newMessages;
            }
            
            this._setEditingMessage(null);
            
            if (this.onSystemPromptChange) {
                this.onSystemPromptChange(this.panelId, trimmedText);
            }
        } finally {
            this._isProcessingEdit = false;
        }
    }

    /**
     * Handle message edit
     * @private
     */
    _handleMessageEdit(messageId, newText) {
        // Prevent recursive calls
        if (this._isProcessingEdit) {
            console.warn('_handleMessageEdit called recursively, ignoring');
            return;
        }
        
        this._isProcessingEdit = true;
        
        try {
            // Ensure messages is a plain array
            if (!Array.isArray(this.messages)) {
                console.error('this.messages is not an array:', this.messages);
                this.messages = [];
                return;
            }
            
            // Find message by iterating instead of using find() to avoid potential recursion
            let message = null;
            for (let i = 0; i < this.messages.length; i++) {
                if (this.messages[i] && this.messages[i].id === messageId) {
                    message = this.messages[i];
                    break;
                }
            }
            
            if (!message) return;
            
            const oldText = message.text;
            message.text = newText;
            message.originalText = oldText;
            
            this._setEditingMessage(null);
            
            // Re-render the message
            const renderer = this.messageRenderers.get(messageId);
            if (renderer) {
                renderer.message = message;
                renderer.render(false);
            }
            
            if (this.onEditMessage) {
                this.onEditMessage(this.panelId, messageId, newText);
            }
        } finally {
            this._isProcessingEdit = false;
        }
    }

    /**
     * Handle message delete
     * @private
     */
    _handleMessageDelete(messageId) {
        // Find index using for loop instead of findIndex()
        let index = -1;
        if (Array.isArray(this.messages)) {
            for (let i = 0; i < this.messages.length; i++) {
                if (this.messages[i] && this.messages[i].id === messageId) {
                    index = i;
                    break;
                }
            }
        }
        if (index === -1) return;
        
        const [deleted] = this.messages.splice(index, 1);
        
        // Remove from DOM
        const renderer = this.messageRenderers.get(messageId);
        if (renderer) {
            renderer.destroy();
            this.messageRenderers.delete(messageId);
        }
        
        // Show empty state if needed
        if (this.messages.length === 0 || 
            (this.messages.length === 1 && this.messages[0].role === 'system')) {
            this.emptyStateEl.classList.remove('hidden');
        }
        
        if (this.onDeleteMessage) {
            this.onDeleteMessage(this.panelId, messageId);
        }
        
        return deleted;
    }

    /**
     * Handle message branch
     * @private
     */
    _handleMessageBranch(messageId) {
        if (this.onBranchAtMessage) {
            this.onBranchAtMessage(this.panelId, messageId);
        }
    }

    /**
     * Set the currently editing message
     * @private
     */
    _setEditingMessage(messageId) {
        // Don't process if we're already processing an edit
        if (this._isProcessingEdit) {
            this.editingMessageId = messageId;
            return;
        }
        
        // Save any current edit first
        if (this.editingMessageId && this.editingMessageId !== messageId) {
            if (this.editingMessageId === 'system-prompt') {
                const value = this.systemPromptPanel.getCurrentEditValue();
                if (value !== null) {
                    this._handleSystemPromptSave(value);
                }
            } else {
                const renderer = this.messageRenderers.get(this.editingMessageId);
                if (renderer && renderer.isEditing) {
                    const textarea = renderer.element?.querySelector('.message-edit-textarea');
                    if (textarea) {
                        this._handleMessageEdit(this.editingMessageId, textarea.value);
                    }
                }
            }
        }
        
        this.editingMessageId = messageId;
        
        if (this.onEditingStateChange) {
            this.onEditingStateChange(messageId);
        }
    }

    /**
     * Save any current edit
     * @returns {boolean} - True if an edit was saved
     */
    saveCurrentEdit() {
        if (!this.editingMessageId) return false;
        
        if (this.editingMessageId === 'system-prompt') {
            const value = this.systemPromptPanel.getCurrentEditValue();
            if (value !== null) {
                this._handleSystemPromptSave(value);
                return true;
            }
        } else {
            const renderer = this.messageRenderers.get(this.editingMessageId);
            if (renderer && renderer.isEditing) {
                const textarea = renderer.element?.querySelector('.message-edit-textarea');
                if (textarea) {
                    // Use for loop instead of find() to avoid recursion
                    let message = null;
                    if (Array.isArray(this.messages)) {
                        for (let i = 0; i < this.messages.length; i++) {
                            if (this.messages[i] && this.messages[i].id === this.editingMessageId) {
                                message = this.messages[i];
                                break;
                            }
                        }
                    }
                    
                    if (message && textarea.value.trim() !== message.text) {
                        this._handleMessageEdit(this.editingMessageId, textarea.value);
                    } else {
                        renderer.cancelEdit();
                        this._setEditingMessage(null);
                    }
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if currently editing
     * @returns {boolean}
     */
    isEditing() {
        return this.editingMessageId !== null;
    }

    /**
     * Destroy the panel and clean up
     */
    destroy() {
        this.messageRenderers.forEach(renderer => renderer.destroy());
        this.messageRenderers.clear();
        this.messages = [];
    }
}

