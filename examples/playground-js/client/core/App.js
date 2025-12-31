/**
 * Main application coordinator
 * Public methods are called from HTML onclick handlers
 */
import { state } from './State.js';
import { Prompt } from '../models/Prompt.js';
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { PromptsSidebar } from '../components/PromptsSidebar.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { SettingsDrawer } from '../components/SettingsDrawer.js';
import { MessageInput } from '../components/MessageInput.js';
import { StatusBar } from '../components/StatusBar.js';
import { PromptHeader } from '../components/PromptHeader.js';
import { Notification } from '../components/Notification.js';
import { getAIResponse, buildConversationHistory } from '../api.js';

// API Key management
const API_KEYS_STORAGE_KEY = 'resilientllm_api_keys';

function loadApiKeys() {
    try {
        const stored = localStorage.getItem(API_KEYS_STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch {
        return {};
    }
}

function saveApiKey(service, key) {
    const keys = loadApiKeys();
    if (key && key.trim()) {
        keys[service] = key.trim();
    } else {
        delete keys[service];
    }
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

function getApiKeyForService(service) {
    const keys = loadApiKeys();
    return keys[service] || '';
}

export class App {
    constructor(elements) {
        this.elements = elements;
        
        // Components
        this.sidebar = null;
        this.chatPanel = null;
        this.settings = null;
        this.messageInput = null;
        this.statusBar = null;
        this.promptHeader = null;
        
        // State
        this.isAIResponding = false;
        this.defaultsLoaded = false;
        this.undoStack = [];
        this.previousConfig = null;
    }

    async init() {
        // Initialize sidebar
        this.sidebar = new PromptsSidebar({
            container: this.elements.promptsList,
            onSelectPrompt: (promptId) => this.openPrompt(promptId),
            onDeletePrompt: (promptId) => this.deletePrompt(promptId)
        });

        // Initialize status bar
        this.statusBar = new StatusBar({
            serviceEl: this.elements.statusService,
            modelEl: this.elements.statusModel,
            modeEl: this.elements.statusMode,
            containerEl: this.elements.statusBar
        });

        // Initialize settings drawer
        this.settings = new SettingsDrawer({
            drawerEl: this.elements.settingsDrawer,
            backdropEl: this.elements.settingsBackdrop,
            bodyEl: this.elements.settingsBody,
            inputs: {
                serviceSelect: this.elements.serviceSelect,
                modelSelect: this.elements.modelSelect,
                apiKeyInput: this.elements.apiKeyInput,
                temperatureInput: this.elements.temperatureInput,
                maxTokensInput: this.elements.maxTokensInput,
                topPInput: this.elements.topPInput,
                modeToggle: this.elements.modeToggle
            },
            onConfigChange: () => {
                const config = this.settings.getConfig();
                this.statusBar.update(config);
                this.chatPanel.setResponseMode(config.responseMode);
            },
            onClose: () => {
                // Save when drawer closes
                this._autoSave();
            }
        });

        // Initialize prompt header
        this.promptHeader = new PromptHeader({
            headerEl: this.elements.promptHeader,
            nameDisplayEl: this.elements.promptNameDisplay,
            onRename: (promptId, newName) => this.renamePrompt(promptId, newName)
        });

        // Initialize chat panel
        this.chatPanel = new ChatPanel({
            messagesContainer: this.elements.messagesContainer,
            emptyStateEl: this.elements.emptyState,
            versionsContainer: this.elements.versionsContainer,
            conversationsContainer: this.elements.conversationsContainer,
            systemPromptHeader: this.elements.systemPromptHeader,
            systemPromptContent: this.elements.systemPromptContent,
            systemPromptDisplay: this.elements.systemPromptDisplay,
            systemPromptPreview: this.elements.systemPromptPreview,
            systemPromptToggle: this.elements.systemPromptToggle,
            onEditMessage: (panelId, messageId, newText) => this._handleEditMessage(messageId, newText),
            onDeleteMessage: (panelId, messageId) => this._handleDeleteMessage(messageId),
            onBranchAtMessage: (panelId, messageId) => this._handleBranchAtMessage(messageId),
            onSwitchConversation: (panelId, conversationId) => this._handleSwitchConversation(conversationId),
            onLoadVersion: (panelId, versionId) => this._handleLoadVersion(versionId),
            onNewConversation: () => this._handleNewConversation(),
            onDeleteConversation: (panelId, conversationId) => this._handleDeleteConversation(conversationId),
            onDeleteVersion: (panelId, versionId) => this._handleDeleteVersion(versionId),
            onSystemPromptChange: () => this._autoSave(),
            onEditingStateChange: (messageId) => {
                state.set('editingMessageId', messageId);
            }
        });

        // Initialize message input
        this.messageInput = new MessageInput({
            inputEl: this.elements.messageInput,
            sendButton: this.elements.sendButton,
            roleToggle: this.elements.roleToggle,
            onSend: (text, role) => this._handleSendMessage(text, role),
            onRoleChange: (role) => {
                state.set('senderRole', role);
            }
        });

        // Set up event listeners
        this._setupEventListeners();

        // Load default settings
        await this._loadDefaultSettings();

        // Load initial state
        this._loadInitialState();

        // Focus input
        this.messageInput.focus();
    }

    // ─────────────────────────────────────────────
    // PUBLIC METHODS (called from index.html)
    // ─────────────────────────────────────────────

    createNewPrompt() {
        this._autoSave();
        
        const prompt = Prompt.create();
        const conversation = Conversation.create(prompt.id, {
            origin: { type: 'fresh', sourceId: null, atMessageId: null }
        });
        
        state.set('currentPromptId', prompt.id);
        state.set('activeConversationId', conversation.id);
        
        this.chatPanel.setPromptId(prompt.id);
        this.chatPanel.loadMessages([]);
        
        this._autoSave();
        this._refreshUI();
    }

    openSettings() {
        this.settings.open();
    }

    closeSettings() {
        this.settings.close();
    }

    // ─────────────────────────────────────────────
    // PROMPT MANAGEMENT
    // ─────────────────────────────────────────────

    openPrompt(promptId) {
        this._autoSave();
        
        const prompt = Prompt.get(promptId);
        if (!prompt) return;

        state.set('currentPromptId', promptId);

        // Get conversations for this prompt
        const conversations = Conversation.listByPrompt(promptId);
        
        let activeConversation;
        if (conversations.length > 0) {
            activeConversation = conversations[0];
        } else {
            activeConversation = Conversation.create(promptId, {
                origin: { type: 'fresh', sourceId: null, atMessageId: null }
            });
        }
        
        state.set('activeConversationId', activeConversation.id);
        
        this.chatPanel.setPromptId(promptId);
        this.chatPanel.loadConversation(activeConversation.id);
        
        if (activeConversation.config) {
            this.settings.setConfig(activeConversation.config);
            this.chatPanel.setResponseMode(activeConversation.config.responseMode || 'text');
        }
        
        const config = this.settings.getConfig();
        this.previousConfig = { ...config };
        this.statusBar.update(config);
        this.chatPanel.setResponseMode(config.responseMode);
        this._refreshUI();
    }

    deletePrompt(promptId) {
        const prompts = Prompt.list();
        const msg = prompts.length === 1
            ? 'Delete this prompt? A new empty prompt will be created.'
            : 'Delete this prompt and all its versions and conversations?';
        if (!confirm(msg)) return;
        
        const wasActive = promptId === state.get('currentPromptId');
        
        const prompt = Prompt.get(promptId);
        if (prompt) prompt.delete();
        
        if (wasActive) {
            const remaining = Prompt.list();
            if (remaining.length > 0) {
                this.openPrompt(remaining[0].id);
            } else {
                this.createNewPrompt();
            }
        } else {
            this._refreshUI();
        }
    }

    renamePrompt(promptId, newName) {
        const prompt = Prompt.get(promptId);
        if (prompt && newName.trim()) {
            prompt.update({ name: newName.trim() });
            this._refreshUI();
        }
    }

    // ─────────────────────────────────────────────
    // MESSAGE HANDLING
    // ─────────────────────────────────────────────

    async _handleSendMessage(text, role) {
        if (!text || this.isAIResponding) return;

        this._ensurePromptAndConversation();

        this.chatPanel.addMessage({ text, role });
        this._autoSave();
        
        if (role === 'user') {
            await this._triggerAIResponse();
        } else {
            // Switch back to user after sending assistant message
            this.messageInput.setRole('user');
        }
    }

    async _triggerAIResponse(regenerate = false) {
        if (this.isAIResponding) return;
        
        const messages = this.chatPanel.getMessages();
        
        if (regenerate) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
                this.chatPanel._handleMessageDelete(lastMessage.id);
            }
        }
        
        const currentMessages = this.chatPanel.getMessages();
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (!lastMessage || lastMessage.role !== 'user') return;
        
        this.isAIResponding = true;
        this.messageInput.setDisabled(true);

        this.chatPanel.showTypingIndicator();

        try {
            const conversationHistory = buildConversationHistory(
                currentMessages.map(m => ({ role: m.role, text: m.text }))
            );
            const llmOptions = this._collectLLMOptions();
            
            const aiResponse = await getAIResponse(conversationHistory, llmOptions);
            
            this.chatPanel.hideTypingIndicator();
            this.chatPanel.addMessage({ text: aiResponse, role: 'assistant' });
            
            this._autoSave();
        } catch (error) {
            this.chatPanel.hideTypingIndicator();
            const errorMessage = error.message || 'Failed to get response from AI.';
            this.chatPanel.addMessage({ text: `Error: ${errorMessage}`, role: 'assistant' });
            console.error('Error sending message:', error);
            
            this._autoSave();
        } finally {
            this.isAIResponding = false;
            this.messageInput.setDisabled(false);
            this.messageInput.focus();
        }
    }

    _handleEditMessage(messageId, newText) {
        const messages = this.chatPanel.getMessages();
        const message = messages.find(m => m.id === messageId);
        if (!message) return;
        
        // Store undo
        this.undoStack.push({
            type: 'edit',
            messageId,
            oldText: message.originalText || message.text,
            newText
        });
        Notification.showUndo(() => this._performUndo());
        
        this._autoSave();
        
        // Trigger AI response if last user message was edited
        if (message.role === 'user') {
            const currentMessages = this.chatPanel.getMessages();
            const lastMessage = currentMessages[currentMessages.length - 1];
            if (lastMessage && lastMessage.id === messageId) {
                this._triggerAIResponse();
            }
        }
    }

    _handleDeleteMessage(messageId) {
        const messages = this.chatPanel.getMessages();
        const index = messages.findIndex(m => m.id === messageId);
        if (index === -1) return;
        
        const message = messages[index];
        
        // Store undo
        this.undoStack.push({
            type: 'delete',
            message: message.toData(),
            index
        });
        Notification.showUndo(() => this._performUndo());
        
        this._autoSave();
        
        // Trigger AI response if last message is now a user message
        const currentMessages = this.chatPanel.getMessages();
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (lastMessage && lastMessage.role === 'user') {
            this._triggerAIResponse();
        }
    }

    _handleBranchAtMessage(messageId) {
        this._autoSave();
        
        const conversationId = state.get('activeConversationId');
        if (!conversationId) return;
        
        const conversation = Conversation.get(conversationId);
        if (!conversation) return;
        
        const branched = conversation.branch(messageId);
        if (!branched) return;
        
        state.set('activeConversationId', branched.id);
        this.chatPanel.loadConversation(branched.id);
        this.settings.setConfig(branched.config);
        const config = this.settings.getConfig();
        this.previousConfig = { ...config };
        
        this._refreshUI();
    }

    // ─────────────────────────────────────────────
    // VERSION & CONVERSATION
    // ─────────────────────────────────────────────

    saveVersion() {
        const messages = this.chatPanel.getMessages();
        const hasContent = messages.some(m => m.text && m.text.trim());
        if (!hasContent) {
            alert('Add some content before saving a version.');
            return;
        }

        this._ensurePromptAndConversation();
        this._autoSave();

        this.chatPanel.versionBar.showSaveVersionModal((notes) => {
            const promptId = state.get('currentPromptId');
            const conversationId = state.get('activeConversationId');
            const conversation = Conversation.get(conversationId);
            
            if (!conversation) return;
            
            const parentVersionId = conversation.origin?.type === 'version' 
                ? conversation.origin.sourceId 
                : null;
            
            const version = Version.create(promptId, {
                messages: conversation.messages,
                config: conversation.config,
                parentVersionId,
                notes
            });
            
            const versionMessageCount = messages.filter(m => m.role !== 'system').length;
            
            conversation.updateOrigin({
                type: 'version',
                sourceId: version.id,
                atMessageId: null,
                versionMessageCount
            });
            
            this.chatPanel.renderMessages();
            this._refreshUI();
        });
    }

    _handleLoadVersion(versionId) {
        this._autoSave();
        
        const promptId = state.get('currentPromptId');
        if (!promptId) return;
        
        const version = Version.get(versionId, promptId);
        if (!version) return;
        
        const versionMessageCount = version.getMessageCount();
        
        const conversation = Conversation.create(promptId, {
            messages: version.messages,
            config: version.config,
            origin: {
                type: 'version',
                sourceId: versionId,
                atMessageId: null,
                versionMessageCount
            }
        });
        
        state.set('activeConversationId', conversation.id);
        this.chatPanel.loadConversation(conversation.id);
        this.settings.setConfig(conversation.config);
        const config = this.settings.getConfig();
        this.previousConfig = { ...config };
        
        this._refreshUI();
    }

    _handleSwitchConversation(conversationId) {
        this._autoSave();
        
        const conversation = Conversation.get(conversationId);
        if (!conversation) return;
        
        state.set('activeConversationId', conversationId);
        this.chatPanel.loadConversation(conversationId);
        
        if (conversation.config) {
            this.settings.setConfig(conversation.config);
            this.chatPanel.setResponseMode(conversation.config.responseMode || 'text');
        }
        
        const config = this.settings.getConfig();
        this.previousConfig = { ...config };
        this.statusBar.update(config);
        this.chatPanel.setResponseMode(config.responseMode);
        this._refreshUI();
    }

    _handleNewConversation() {
        this._autoSave();
        
        const promptId = state.get('currentPromptId');
        if (!promptId) return;
        
        const conversation = Conversation.create(promptId, {
            origin: { type: 'fresh', sourceId: null, atMessageId: null }
        });
        
        state.set('activeConversationId', conversation.id);
        this.chatPanel.loadMessages([]);
        this.chatPanel.setPromptId(promptId);
        
        this._refreshUI();
    }

    _handleDeleteConversation(conversationId) {
        const promptId = state.get('currentPromptId');
        const isActive = conversationId === state.get('activeConversationId');
        const conversations = Conversation.listByPrompt(promptId);
        
        if (isActive && conversations.length === 1) {
            if (!confirm('Delete this conversation? A new empty conversation will be created.')) {
                return;
            }
        }
        
        const conversation = Conversation.get(conversationId);
        if (conversation) conversation.delete();
        
        if (isActive) {
            const remaining = Conversation.listByPrompt(promptId);
            if (remaining.length > 0) {
                this._handleSwitchConversation(remaining[0].id);
            } else {
                this._handleNewConversation();
            }
        } else {
            this._refreshUI();
        }
    }

    _handleDeleteVersion(versionId) {
        if (!confirm(`Delete ${versionId}?`)) return;
        
        const promptId = state.get('currentPromptId');
        const version = Version.get(versionId, promptId);
        if (version) {
            version.delete();
            this._refreshUI();
        }
    }

    // ─────────────────────────────────────────────
    // INTERNAL HELPERS
    // ─────────────────────────────────────────────

    _loadInitialState() {
        const prompts = Prompt.list();
        
        if (prompts.length > 0) {
            this.openPrompt(prompts[0].id);
        } else {
            // No prompts exist, but don't create one automatically
            // User will create when they send first message
        }
        
        this._refreshUI();
    }

    _ensurePromptAndConversation() {
        if (!state.get('currentPromptId')) {
            const prompt = Prompt.create();
            const conversation = Conversation.create(prompt.id, {
                origin: { type: 'fresh', sourceId: null, atMessageId: null }
            });
            
            state.set('currentPromptId', prompt.id);
            state.set('activeConversationId', conversation.id);
            
            this.chatPanel.setPromptId(prompt.id);
            this.chatPanel.loadConversation(conversation.id);
            
            this._refreshUI();
        }
    }

    _autoSave() {
        const conversationId = state.get('activeConversationId');
        if (!conversationId) return;
        
        const conversation = Conversation.get(conversationId);
        if (!conversation) return;
        
        const messages = this.chatPanel.getMessages();
        const config = this.settings.getConfig();
        
        // Check if config changed
        const configChanged = JSON.stringify(this.previousConfig) !== JSON.stringify(config);
        
        conversation.messages = messages;
        conversation.config = config;
        conversation.save();
        
        // Trigger pulse if config changed
        if (configChanged && this.statusBar) {
            this.previousConfig = { ...config };
            this.statusBar.pulse();
        }
        
        // Auto-update prompt name if still default
        const promptId = state.get('currentPromptId');
        if (promptId) {
            const prompt = Prompt.get(promptId);
            if (prompt && prompt.name === 'New Prompt') {
                const newName = Prompt.generateNameFromMessages(messages);
                if (newName !== 'New Prompt' && !newName.startsWith('Prompt ')) {
                    prompt.update({ name: newName });
                    this.sidebar.refresh();
                    this.promptHeader.refresh();
                }
            }
        }
        
        this.chatPanel.refreshVersionBar();
    }

    _collectLLMOptions() {
        const config = this.settings.getConfig();
        const options = {};
        
        const service = config.service;
        const actualService = service === 'local' ? 'ollama' : service;
        if (service) options.aiService = actualService;
        
        if (actualService) {
            const apiKey = getApiKeyForService(actualService);
            if (apiKey) options.apiKey = apiKey;
        }
        
        if (config.model) options.model = config.model;
        
        if (config.temperature) {
            const temp = parseFloat(config.temperature);
            if (!isNaN(temp)) options.temperature = temp;
        }
        
        if (config.maxTokens) {
            const max = parseInt(config.maxTokens, 10);
            if (!isNaN(max) && max > 0) options.maxTokens = max;
        }
        
        if (config.topP) {
            const topP = parseFloat(config.topP);
            if (!isNaN(topP)) options.topP = topP;
        }
        
        if (config.responseMode === 'json') {
            options.responseFormat = { type: 'json_object' };
        }
        
        return options;
    }

    async _loadDefaultSettings() {
        if (this.defaultsLoaded) return;
        
        try {
            const response = await fetch('http://localhost:3000/api/config');
            if (!response.ok) {
                this._setFallbackDefaults();
                this.defaultsLoaded = true;
                return;
            }
            const config = await response.json();
            
            const uiService = config.aiService === 'ollama' ? 'local' : config.aiService;
            
            this.settings.setConfig({
                service: uiService || '',
                model: config.model || '',
                temperature: config.temperature?.toString() || '',
                maxTokens: config.maxTokens?.toString() || '',
                topP: config.topP?.toString() || ''
            });
            
            if (this.elements.serviceSelect.value) {
                const actualService = this.elements.serviceSelect.value === 'local' ? 'ollama' : this.elements.serviceSelect.value;
                this.elements.apiKeyInput.value = getApiKeyForService(actualService);
            }
            
            const settingsConfig = this.settings.getConfig();
            this.previousConfig = { ...settingsConfig };
            this.statusBar.update(settingsConfig);
            this.chatPanel.setResponseMode(settingsConfig.responseMode);
            this.defaultsLoaded = true;
        } catch (error) {
            console.warn('Error loading LLM config:', error);
            this._setFallbackDefaults();
            this.defaultsLoaded = true;
        }
    }

    _setFallbackDefaults() {
        this.settings.setConfig({
            service: 'openai',
            model: 'gpt-4o-mini',
            temperature: '0.7',
            maxTokens: '2048',
            topP: '0.95'
        });
        const config = this.settings.getConfig();
        this.previousConfig = { ...config };
        if (this.statusBar) {
            this.statusBar.update(config);
        }
        this.chatPanel.setResponseMode(config.responseMode);
    }

    _refreshUI() {
        this.sidebar.setActivePrompt(state.get('currentPromptId'));
        this.sidebar.refresh();
        this.chatPanel.versionBar.setActiveConversation(state.get('activeConversationId'));
        this.chatPanel.refreshVersionBar();
        this.promptHeader.refresh();
    }


    _performUndo() {
        if (this.undoStack.length === 0) return;
        
        const undoAction = this.undoStack.pop();
        const messages = this.chatPanel.getMessages();
        
        if (undoAction.type === 'edit') {
            const message = messages.find(m => m.id === undoAction.messageId);
            if (message) {
                message.text = undoAction.oldText;
                this.chatPanel.renderMessages();
            }
        } else if (undoAction.type === 'delete') {
            const restored = Message.fromData(undoAction.message);
            messages.splice(undoAction.index, 0, restored);
            this.chatPanel.renderMessages();
        }
        
        this._autoSave();
        
        Notification.removeUndo();
    }


    _setupEventListeners() {
        // Settings toggle - entire status bar is clickable
        if (this.elements.statusBar) {
            this.elements.statusBar.addEventListener('click', () => this.settings.open());
            this.elements.statusBar.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.settings.open();
                }
            });
        }
        this.elements.settingsCloseButton.addEventListener('click', () => this.settings.close());
        this.elements.settingsBackdrop.addEventListener('click', () => this.settings.close());
        
        // Service change - update API key (SettingsDrawer handles config change, but we need API key logic)
        this.elements.serviceSelect.addEventListener('change', () => {
            const service = this.elements.serviceSelect.value;
            const actualService = service === 'local' ? 'ollama' : service;
            if (actualService) {
                this.elements.apiKeyInput.value = getApiKeyForService(actualService);
                const serviceName = this.elements.serviceSelect.options[this.elements.serviceSelect.selectedIndex]?.text || 'service';
                this.elements.apiKeyInput.placeholder = `Enter ${serviceName} API key (optional)`;
            } else {
                this.elements.apiKeyInput.value = '';
                this.elements.apiKeyInput.placeholder = 'Select a service first';
            }
        });
        
        // API key save
        let apiKeySaveTimeout;
        this.elements.apiKeyInput.addEventListener('input', () => {
            clearTimeout(apiKeySaveTimeout);
            apiKeySaveTimeout = setTimeout(() => {
                const service = this.elements.serviceSelect.value;
                const actualService = service === 'local' ? 'ollama' : service;
                if (actualService) {
                    saveApiKey(actualService, this.elements.apiKeyInput.value);
                }
            }, 500);
        });
        
        // New prompt button
        this.elements.newPromptButton.addEventListener('click', () => this.createNewPrompt());
        
        // Save version button
        this.elements.saveVersionButton.addEventListener('click', () => this.saveVersion());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (this.undoStack.length > 0) {
                    this._performUndo();
                }
            }
        });
        
        // Click outside to save edit
        document.addEventListener('mousedown', (e) => {
            const editingId = state.get('editingMessageId');
            if (!editingId) return;
            
            const clickedTextarea = e.target.closest('textarea');
            if (clickedTextarea && (
                clickedTextarea.classList.contains('message-edit-textarea') ||
                clickedTextarea.classList.contains('system-prompt-input-field')
            )) {
                return;
            }
            
            const isInteractive = e.target.tagName === 'BUTTON' ||
                                 e.target.tagName === 'A' ||
                                 e.target.tagName === 'INPUT' ||
                                 e.target.tagName === 'SELECT' ||
                                 e.target.closest('.input-field') ||
                                 e.target.closest('.send-button') ||
                                 e.target.closest('.settings-drawer') ||
                                 e.target.closest('.message-action-btn') ||
                                 e.target.closest('button') ||
                                 e.target.closest('a') ||
                                 e.target.closest('.system-prompt-pinned-header');
            
            if (isInteractive) return;
            
            setTimeout(() => {
                if (state.get('editingMessageId')) {
                    this.chatPanel.saveCurrentEdit();
                }
            }, 0);
        });
        
        // Auto-save on page unload
        window.addEventListener('beforeunload', () => this._autoSave());
        
        // Periodic auto-save
        setInterval(() => this._autoSave(), 30000);
    }
}

// Export factory function for easy initialization
export function createApp(elements) {
    return new App(elements);
}

