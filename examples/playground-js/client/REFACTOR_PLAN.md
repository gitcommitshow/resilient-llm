# Playground Client Refactoring Plan

## Goals

1. **Separation of concerns** - UI code separate from business logic
2. **Easy navigation** - File names indicate purpose, easy to find code
3. **Clear data schemas** - Easy to find and understand data structures
4. **No circular dependencies** - Clean import graph
5. **Reusable components** - Components can be instantiated multiple times
6. **Multi-panel support** - Can show multiple prompts/conversations simultaneously
7. **Self-documenting HTML** - `index.html` shows what buttons do via inline handlers

---

## Target File Structure

```
client/
├── index.html                    # Layout + inline onclick handlers + bootstrap
├── api.js                        # Keep as-is (ResilientLLM API integration)
├── styles.css                    # Keep as-is
│
├── core/
│   ├── App.js                    # Main coordinator, public methods for HTML
│   ├── State.js                  # Application state + event emitter
│   └── Storage.js                # localStorage abstraction
│
├── models/
│   ├── Message.js                # Message schema + helpers
│   ├── Conversation.js           # Conversation schema + helpers + persistence
│   ├── Version.js                # Version schema + helpers + persistence
│   └── Prompt.js                 # Prompt schema + helpers + persistence
│
├── components/
│   ├── PromptsSidebar.js         # Left sidebar with prompts list
│   ├── ChatPanel.js              # Single chat panel (instantiable)
│   ├── MessageRenderer.js        # Renders individual messages
│   ├── SystemPromptPanel.js      # Pinned system prompt editor
│   ├── VersionBar.js             # Versions + conversations bar
│   └── SettingsDrawer.js         # Settings panel
│
└── utils/
    ├── markdown.js               # Markdown rendering wrapper
    ├── datetime.js               # Date/time formatting
    └── dom.js                    # DOM helper functions
```

---

## Dependency Graph (Import Order)

```
LAYER 0: No dependencies
├── utils/datetime.js
├── utils/markdown.js
├── utils/dom.js
├── core/Storage.js
└── api.js

LAYER 1: Depends on Layer 0
├── models/Message.js         → (nothing, pure class)
├── models/Prompt.js          → Storage
├── models/Version.js         → Storage, Message, Prompt
└── models/Conversation.js    → Storage, Message

LAYER 2: Depends on Layer 0-1
└── core/State.js             → (nothing, pure state machine)

LAYER 3: Depends on Layer 0-2
├── components/MessageRenderer.js    → Message, markdown, datetime
├── components/SystemPromptPanel.js  → Message, dom
├── components/VersionBar.js         → Version, Conversation, datetime
├── components/PromptsSidebar.js     → Prompt, Version, Conversation, datetime
├── components/ChatPanel.js          → MessageRenderer, SystemPromptPanel, Conversation, Message, dom
└── components/SettingsDrawer.js     → State, dom

LAYER 4: Orchestrator
└── core/App.js               → ALL models, ALL components, State, api.js
```

---

## File Specifications

### `core/Storage.js`

```javascript
/**
 * LocalStorage abstraction with JSON serialization
 */
const STORAGE_KEY = 'resilientllm_playground_v3';

export const Storage = {
  _getData() { /* parse localStorage */ },
  _setData(data) { /* stringify to localStorage */ },
  
  get(collection) { /* return array for collection */ },
  set(collection, items) { /* save array for collection */ },
  
  // Collections: 'prompts', 'versions', 'conversations'
};
```

### `core/State.js`

```javascript
/**
 * Application state with event emission
 * Supports multiple open panels
 */
export class State {
  constructor() {
    this.listeners = new Map();
    this.state = {
      openPanels: [],        // [{ panelId, promptId, conversationId }]
      focusedPanelId: null,
      settingsOpen: false,
      globalConfig: {        // Shared config (can be overridden per panel)
        service: '',
        model: '',
        responseMode: 'text'
      }
    };
  }
  
  get(key) {}
  set(key, value) {}
  on(event, callback) {}
  off(event, callback) {}
  emit(event, ...args) {}
}

export const state = new State();
```

### `models/Message.js`

```javascript
/**
 * Message class - represents a single message in a conversation
 * Messages are stored inside Conversations, not separately
 */
export class Message {
  /**
   * @param {Object} data
   * @param {string} data.text
   * @param {'system'|'user'|'assistant'} data.role
   * @param {string} [data.id] - Auto-generated if not provided
   * @param {string|Date} [data.timestamp] - Auto-set to now if not provided
   */
  constructor({ text, role, id, timestamp }) {
    this.id = id || Message.generateId();
    this.text = text || '';
    this.role = role;
    this.timestamp = timestamp 
      ? (timestamp instanceof Date ? timestamp.toISOString() : timestamp)
      : new Date().toISOString();
    this.originalText = text || ''; // For undo support
  }

  /**
   * Generate a unique ID for a message
   * @returns {string}
   */
  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Create a Message instance from plain object (for deserialization)
   * @param {Object} data
   * @returns {Message}
   */
  static fromData(data) {
    return new Message({
      id: data.id,
      text: data.text,
      role: data.role,
      timestamp: data.timestamp
    });
  }

  /**
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toData() {
    return {
      id: this.id,
      text: this.text,
      role: this.role,
      timestamp: this.timestamp
    };
  }
}
```

### `models/Conversation.js`

```javascript
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
   * @param {string} data.id
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

  static generateId() {
    return 'conv-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Create a new Conversation instance
   * @param {string} promptId
   * @param {Object} options
   * @param {Message[]} [options.messages]
   * @param {Object} [options.config]
   * @param {ConversationOrigin} [options.origin]
   * @returns {Conversation}
   */
  static create(promptId, options = {}) {
    return new Conversation({
      promptId,
      messages: options.messages || [],
      config: options.config || {},
      origin: options.origin || { type: 'fresh', sourceId: null, atMessageId: null }
    });
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
   * Get all conversations for a prompt
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
   */
  addMessage(message) {
    const msg = message instanceof Message ? message : new Message(message);
    this.messages.push(msg);
    this.save();
  }

  /**
   * Update a message in this conversation
   * @param {string} messageId
   * @param {string} newText
   */
  updateMessage(messageId, newText) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.text = newText;
      this.save();
    }
  }

  /**
   * Delete a message from this conversation
   * @param {string} messageId
   */
  deleteMessage(messageId) {
    this.messages = this.messages.filter(m => m.id !== messageId);
    this.save();
  }

  /**
   * Get count of non-system messages
   * @returns {number}
   */
  getMessageCount() {
    return this.messages.filter(m => m.role !== 'system').length;
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
   * Convert to plain object for serialization
   * @returns {Object}
   */
  toData() {
    return {
      id: this.id,
      promptId: this.promptId,
      messages: this.messages.map(m => m.toData()),
      config: this.config,
      origin: this.origin,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}
```

### `models/Version.js`

```javascript
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
    this.messages = messages.map(m => m instanceof Message ? m : Message.fromData(m));
    this.config = { ...config };
    this.parentVersionId = parentVersionId;
    this.notes = notes;
    this.createdAt = createdAt || new Date().toISOString();
  }

  /**
   * Create a new Version from a conversation
   * @param {string} promptId
   * @param {Object} options
   * @param {Message[]} options.messages
   * @param {Object} options.config
   * @param {string|null} [options.parentVersionId]
   * @param {string} [options.notes]
   * @returns {Version}
   */
  static create(promptId, { messages, config, parentVersionId = null, notes = '' }) {
    const existing = Version.listByPrompt(promptId);
    const versionNumber = existing.length + 1;
    const id = `v${versionNumber}`;

    return new Version({
      id,
      promptId,
      messages: messages.map(m => m instanceof Message ? m : Message.fromData(m)),
      config: { ...config },
      parentVersionId,
      notes
    }).save();
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
   * Get all versions for a prompt
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
   * @param {string} promptId
   * @returns {boolean}
   */
  isBestVersion(promptId) {
    const best = Version.getBestVersion(promptId);
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
      messages: this.messages.map(m => m.toData()),
      config: this.config,
      parentVersionId: this.parentVersionId,
      notes: this.notes,
      createdAt: this.createdAt
    };
  }
}
```

### `models/Prompt.js`

```javascript
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

  static generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Create a new Prompt instance
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
   * Get all prompts
   * @returns {Prompt[]}
   */
  static list() {
    return Storage.get('prompts')
      .map(p => Prompt.fromData(p))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Generate a name from messages
   * @param {Message[]} messages
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
   */
  setBestVersion(versionId) {
    this.bestVersionId = versionId;
    this.save();
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
```

### `utils/datetime.js`

```javascript
export function formatTime(date) {}
export function formatRelativeTime(dateString) {}
```

### `utils/markdown.js`

```javascript
export function renderMarkdown(text) {}
```

### `utils/dom.js`

```javascript
export function createElement(tag, className, attributes) {}
export function clearElement(el) {}
export function scrollToBottom(el) {}
export function autoResizeTextarea(textarea) {}
```

### `components/MessageRenderer.js`

```javascript
/**
 * Renders a single message
 * Handles: display mode, edit mode, actions (branch, delete)
 */
import { Message } from '../models/Message.js';
import { renderMarkdown } from '../utils/markdown.js';
import { formatTime } from '../utils/datetime.js';

export class MessageRenderer {
  constructor({ 
    container,           // Parent element to render into
    message,             // Message object
    responseMode,        // 'text' | 'json'
    onEdit,              // (messageId, newText) => void
    onDelete,            // (messageId) => void
    onBranch,            // (messageId) => void
  }) {}
  
  render() {}
  startEdit() {}
  saveEdit() {}
  cancelEdit() {}
  destroy() {}
}
```

### `components/SystemPromptPanel.js`

```javascript
/**
 * Pinned system prompt display and editor
 */
export class SystemPromptPanel {
  constructor({
    container,
    onSave,              // (text) => void
  }) {}
  
  render(systemMessage) {}
  expand() {}
  collapse() {}
  startEdit() {}
  saveEdit() {}
}
```

### `components/VersionBar.js`

```javascript
/**
 * Displays versions and conversations for a prompt
 */
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';

export class VersionBar {
  constructor({
    versionsContainer,
    conversationsContainer,
    promptId,
    activeConversationId,
    onLoadVersion,        // (versionId) => void
    onSwitchConversation, // (conversationId) => void
    onDeleteVersion,      // (versionId) => void
    onDeleteConversation, // (conversationId) => void
    onNewConversation,    // () => void
    onToggleBestVersion,  // (versionId) => void
  }) {}
  
  refresh() {}
  setActiveConversation(conversationId) {}
}
```

### `components/PromptsSidebar.js`

```javascript
/**
 * Left sidebar showing all prompts
 */
import { Prompt } from '../models/Prompt.js';
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';

export class PromptsSidebar {
  constructor({
    container,
    onSelectPrompt,      // (promptId) => void
    onDeletePrompt,      // (promptId) => void
  }) {}
  
  refresh() {}
  setActivePrompt(promptId) {}
}
```

### `components/ChatPanel.js`

```javascript
/**
 * Complete chat panel - can be instantiated multiple times
 * Contains: header, version bar, system prompt, messages, input
 */
import { MessageRenderer } from './MessageRenderer.js';
import { SystemPromptPanel } from './SystemPromptPanel.js';
import { VersionBar } from './VersionBar.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';

export class ChatPanel {
  constructor({
    container,
    panelId,
    promptId,
    conversationId,
    config,
    onSendMessage,       // (panelId, { text, role }) => void
    onEditMessage,       // (panelId, messageId, newText) => void
    onDeleteMessage,     // (panelId, messageId) => void
    onBranchAtMessage,   // (panelId, messageId) => void
    onSaveVersion,       // (panelId, notes) => void
    onSwitchConversation,// (panelId, conversationId) => void
    onLoadVersion,       // (panelId, versionId) => void
    onConfigChange,      // (panelId, config) => void
  }) {}
  
  loadConversation(conversationId) {}
  addMessage(message) {}
  setResponding(isResponding) {}
  refresh() {}
  destroy() {}
}
```

### `components/SettingsDrawer.js`

```javascript
/**
 * Settings drawer panel
 */
export class SettingsDrawer {
  constructor({
    drawerEl,
    backdropEl,
    bodyEl,
    onConfigChange,      // (config) => void
  }) {}
  
  open() {}
  close() {}
  setConfig(config) {}
  getConfig() {}
}
```

### `core/App.js`

```javascript
/**
 * Main application coordinator
 * Public methods are called from HTML onclick handlers
 */
import { state } from './State.js';
import { Prompt } from '../models/Prompt.js';
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';

// Usage examples:
// const prompt = Prompt.create('My Prompt');
// const conversation = Conversation.create(prompt.id, { messages: [] });
// const message = new Message({ text: 'Hello', role: 'user' });
// conversation.addMessage(message);
// conversation.save();
import { PromptsSidebar } from '../components/PromptsSidebar.js';
import { ChatPanel } from '../components/ChatPanel.js';
import { SettingsDrawer } from '../components/SettingsDrawer.js';
import { getAIResponse, buildConversationHistory } from '../api.js';

export class App {
  constructor(elements) {
    this.elements = elements;
    this.panels = new Map();  // panelId → ChatPanel instance
    this.sidebar = null;
    this.settings = null;
  }

  async init() {}

  // ─────────────────────────────────────────────
  // PUBLIC METHODS (called from index.html)
  // ─────────────────────────────────────────────
  
  createNewPrompt() {}
  openSettings() {}
  closeSettings() {}
  
  // ─────────────────────────────────────────────
  // PROMPT MANAGEMENT
  // ─────────────────────────────────────────────
  
  openPrompt(promptId) {}
  deletePrompt(promptId) {}
  renamePrompt(promptId, newName) {}
  
  // ─────────────────────────────────────────────
  // PANEL MANAGEMENT
  // ─────────────────────────────────────────────
  
  createPanel(promptId, conversationId) {}
  closePanel(panelId) {}
  focusPanel(panelId) {}
  
  // ─────────────────────────────────────────────
  // MESSAGE HANDLING
  // ─────────────────────────────────────────────
  
  async handleSendMessage(panelId, { text, role }) {}
  handleEditMessage(panelId, messageId, newText) {}
  handleDeleteMessage(panelId, messageId) {}
  handleBranchAtMessage(panelId, messageId) {}
  
  // ─────────────────────────────────────────────
  // VERSION & CONVERSATION
  // ─────────────────────────────────────────────
  
  handleSaveVersion(panelId, notes) {}
  handleLoadVersion(panelId, versionId) {}
  handleSwitchConversation(panelId, conversationId) {}
  handleNewConversation(panelId) {}
  handleDeleteConversation(panelId, conversationId) {}
  handleDeleteVersion(panelId, versionId) {}
  
  // ─────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────
  
  _loadInitialState() {}
  _autoSave(panelId) {}
  _getConfigForPanel(panelId) {}
}
```

### `index.html` (Bootstrap Section)

```html
<script type="module">
    import { App } from './core/App.js';
    
    window.app = new App({
        promptsList: document.getElementById('promptsList'),
        mainContent: document.getElementById('mainContent'),
        promptHeader: document.getElementById('promptHeader'),
        promptNameDisplay: document.getElementById('promptNameDisplay'),
        settingsDrawer: document.getElementById('settingsDrawer'),
        settingsBackdrop: document.getElementById('settingsBackdrop'),
        settingsBody: document.getElementById('settingsBody'),
    });
    
    app.init();
</script>
```

---

## Implementation Order

### Phase 1: Foundation (No UI changes)

1. **`utils/datetime.js`** - Extract `formatTime`, `formatRelativeTime` from existing code
2. **`utils/markdown.js`** - Extract `renderMarkdown` 
3. **`utils/dom.js`** - Extract `scrollToBottom`, `autoResizeTextarea`, `createElement`
4. **`core/Storage.js`** - Extract storage logic from `sessions.js`

### Phase 2: Models (No UI changes)

5. **`models/Message.js`** - Create class, extract from `messages.js`
6. **`models/Prompt.js`** - Create class, extract `PromptStore` from `sessions.js`
7. **`models/Version.js`** - Create class, extract `VersionStore` from `sessions.js`
8. **`models/Conversation.js`** - Create class, extract `ConversationStore` from `sessions.js`

### Phase 3: State

9. **`core/State.js`** - Create new, migrate from `AppState` in `sessions.js`

### Phase 4: Components

10. **`components/MessageRenderer.js`** - Extract from `messages.js`
11. **`components/SystemPromptPanel.js`** - Extract from `index.html`
12. **`components/VersionBar.js`** - Extract from `ui.js` (`PromptUI.refreshVersions/Conversations`)
13. **`components/PromptsSidebar.js`** - Extract from `ui.js` (`PromptUI.refreshPromptsList`)
14. **`components/SettingsDrawer.js`** - Extract from `index.html`
15. **`components/ChatPanel.js`** - Compose from above + extract from `index.html`

### Phase 5: Orchestration

16. **`core/App.js`** - Create, migrate logic from `index.html` `<script>` section
17. **`index.html`** - Slim down to layout + onclick handlers + bootstrap

### Phase 6: Cleanup

18. Delete old files: `sessions.js`, `messages.js`, `ui.js`
19. Test all functionality
20. Update any documentation

---

## Migration Strategy

### Approach: Parallel Implementation

1. Create new files alongside old ones
2. New files use ES modules (`import`/`export`)
3. Old files remain functional until fully migrated
4. Once new structure works, delete old files

### Testing Checkpoints

After each phase, verify:
- [ ] No console errors
- [ ] Prompts list loads
- [ ] Can create new prompt
- [ ] Can send messages
- [ ] AI responds
- [ ] Can edit/delete messages
- [ ] Versions save and load
- [ ] Conversations switch correctly
- [ ] Settings drawer works
- [ ] Data persists across refresh

---

## Key Patterns to Follow

### 1. Component Constructor Pattern

```javascript
constructor({
  container,        // Required: where to render
  ...callbacks      // Required: how to communicate back
}) {
  this.container = container;
  this.callbacks = callbacks;
  this.state = {};  // Internal state
  this.render();
  this.bindEvents();
}
```

### 2. Model Pattern (Class-Based)

```javascript
export class ModelName {
  constructor(data) {
    // Initialize instance properties
    this.id = data.id || ModelName.generateId();
    // ... other properties
  }

  // Static factory method
  static create(data) {
    return new ModelName(data).save();
  }

  // Static getter
  static get(id) {
    const data = Storage.get('collection').find(item => item.id === id);
    return data ? ModelName.fromData(data) : null;
  }

  // Static list
  static list() {
    return Storage.get('collection').map(item => ModelName.fromData(item));
  }

  // Instance save
  save() {
    // Persist to storage
    return this;
  }

  // Instance delete
  delete() {
    // Remove from storage
  }

  // Deserialization
  static fromData(data) {
    return new ModelName(data);
  }

  // Serialization
  toData() {
    return { /* plain object */ };
  }

  // Domain-specific instance methods
  someMethod() {}
}
```

### 3. Callback Communication (No Global Events for Simple Cases)

```javascript
// Parent creates child with callbacks
this.child = new ChildComponent({
  container: el,
  onSomething: (data) => this.handleSomething(data)
});

// Child calls callback
this.callbacks.onSomething(data);
```

### 4. State Events (For Cross-Component Communication)

```javascript
// Component subscribes
state.on('config:changed', (config) => this.applyConfig(config));

// App emits
state.emit('config:changed', newConfig);
```

---

## Notes for Implementer

1. **Keep `api.js` unchanged** - It's already clean and demonstrates ResilientLLM usage
2. **Preserve all existing functionality** - This is a refactor, not a rewrite
3. **Maintain backward compatibility with stored data** - Same localStorage key and structure
4. **Use ES modules** - `import`/`export` syntax throughout
5. **No build step required** - Browser-native ES modules
6. **Test in browser** - No automated tests needed, manual verification is fine

---

## Questions to Resolve During Implementation

1. Should `State.js` be a singleton or instantiated by App?
2. How to handle undo/redo? (Currently uses `window.playgroundUndoStack`)
3. Should API key management stay in App.js or move to a separate module?
4. How to handle the typing indicator? (Part of ChatPanel or separate?)

