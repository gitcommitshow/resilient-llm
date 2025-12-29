/**
 * Application Context - Global state management
 */
import { useState, useEffect, useContext, createContext, useCallback, useRef, useMemo } from 'react';
import { Storage, generateId, API_URL, getApiKey } from '../utils';

const AppContext = createContext(null);

/**
 * Hook to access app context
 */
export function useApp() {
    const context = useContext(AppContext);
    if (!context) throw new Error('useApp must be used within AppProvider');
    return context;
}

/**
 * App Provider - wraps the application with global state
 */
export function AppProvider({ children }) {
    const [prompts, setPrompts] = useState([]);
    const [currentPromptId, setCurrentPromptId] = useState(null);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [config, setConfig] = useState({
        service: 'openai', model: 'gpt-4o-mini', temperature: '0.7',
        maxTokens: '2048', topP: '0.95', responseMode: 'text'
    });
    const [isResponding, setIsResponding] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [senderRole, setSenderRole] = useState('user');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [undoNotification, setUndoNotification] = useState(null);
    const undoStackRef = useRef([]);
    const undoTimeoutRef = useRef(null);

    // Load prompts from storage
    const refreshPrompts = useCallback(() => {
        const data = Storage.get('prompts')
            .map(p => ({ ...p }))
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setPrompts(data);
    }, []);

    // Get versions for a prompt
    const getVersions = useCallback((promptId) => {
        return Storage.get('versions')
            .filter(v => v.promptId === promptId)
            .sort((a, b) => {
                const numA = parseInt(a.id.replace('v', ''), 10);
                const numB = parseInt(b.id.replace('v', ''), 10);
                return numA - numB;
            });
    }, []);

    // Get conversations for a prompt
    const getConversations = useCallback((promptId) => {
        return Storage.get('conversations')
            .filter(c => c.promptId === promptId)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }, []);

    // Get best version for a prompt (explicitly marked or latest)
    const getBestVersion = useCallback((promptId) => {
        const prompt = Storage.get('prompts').find(p => p.id === promptId);
        if (!prompt) return null;
        
        const versions = getVersions(promptId);
        if (versions.length === 0) return null;
        
        if (prompt.bestVersionId) {
            const best = versions.find(v => v.id === prompt.bestVersionId);
            if (best) return best;
        }
        
        // Default to latest
        return versions[versions.length - 1];
    }, [getVersions]);

    // Toggle best version
    const toggleBestVersion = useCallback((versionId) => {
        if (!currentPromptId) return;
        
        const all = Storage.get('prompts');
        const idx = all.findIndex(p => p.id === currentPromptId);
        if (idx < 0) return;
        
        const prompt = all[idx];
        const versions = getVersions(currentPromptId);
        const version = versions.find(v => v.id === versionId);
        if (!version) return;
        
        const bestVersion = getBestVersion(currentPromptId);
        const isBest = bestVersion?.id === versionId;
        const isExplicitBest = prompt.bestVersionId === versionId;
        
        if (isBest && isExplicitBest) {
            // Unset explicit best, go back to "latest is best"
            all[idx].bestVersionId = null;
        } else if (!isBest) {
            // Mark this version as best
            all[idx].bestVersionId = versionId;
        } else if (isBest && !isExplicitBest) {
            // If isBest but not explicit (it's latest), clicking sets it as explicit best
            all[idx].bestVersionId = versionId;
        }
        
        all[idx].updatedAt = new Date().toISOString();
        Storage.set('prompts', all);
        refreshPrompts();
    }, [currentPromptId, getVersions, getBestVersion, refreshPrompts]);

    // Load conversation messages
    const loadConversation = useCallback((conversationId) => {
        const conv = Storage.get('conversations').find(c => c.id === conversationId);
        if (conv) {
            setMessages(conv.messages || []);
            setActiveConversationId(conversationId);
            if (conv.config) setConfig(prev => ({ ...prev, ...conv.config }));
        }
    }, []);

    // Save current conversation
    const saveConversation = useCallback(() => {
        if (!activeConversationId) return;
        const all = Storage.get('conversations');
        const idx = all.findIndex(c => c.id === activeConversationId);
        if (idx >= 0) {
            all[idx].messages = messages;
            all[idx].config = config;
            all[idx].updatedAt = new Date().toISOString();
            Storage.set('conversations', all);
        }
    }, [activeConversationId, messages, config]);

    // Create new prompt
    const createPrompt = useCallback(() => {
        saveConversation();
        const promptId = generateId();
        const convId = 'conv-' + generateId();
        const now = new Date().toISOString();
        
        Storage.set('prompts', [...Storage.get('prompts'), {
            id: promptId, name: 'New Prompt', bestVersionId: null,
            createdAt: now, updatedAt: now
        }]);
        Storage.set('conversations', [...Storage.get('conversations'), {
            id: convId, promptId, messages: [], config: {},
            origin: { type: 'fresh' }, createdAt: now, updatedAt: now
        }]);
        
        setCurrentPromptId(promptId);
        setActiveConversationId(convId);
        setMessages([]);
        refreshPrompts();
    }, [saveConversation, refreshPrompts]);

    // Open prompt
    const openPrompt = useCallback((promptId) => {
        saveConversation();
        setCurrentPromptId(promptId);
        const convs = getConversations(promptId);
        if (convs.length > 0) {
            loadConversation(convs[0].id);
        } else {
            const convId = 'conv-' + generateId();
            const now = new Date().toISOString();
            Storage.set('conversations', [...Storage.get('conversations'), {
                id: convId, promptId, messages: [], config: {},
                origin: { type: 'fresh' }, createdAt: now, updatedAt: now
            }]);
            setActiveConversationId(convId);
            setMessages([]);
        }
        refreshPrompts();
    }, [saveConversation, getConversations, loadConversation, refreshPrompts]);

    // Delete prompt
    const deletePrompt = useCallback((promptId) => {
        if (!confirm('Delete this prompt and all its data?')) return;
        Storage.set('prompts', Storage.get('prompts').filter(p => p.id !== promptId));
        Storage.set('versions', Storage.get('versions').filter(v => v.promptId !== promptId));
        Storage.set('conversations', Storage.get('conversations').filter(c => c.promptId !== promptId));
        
        if (promptId === currentPromptId) {
            const remaining = Storage.get('prompts');
            if (remaining.length > 0) openPrompt(remaining[0].id);
            else createPrompt();
        }
        refreshPrompts();
    }, [currentPromptId, openPrompt, createPrompt, refreshPrompts]);

    // Rename prompt
    const renamePrompt = useCallback((promptId, newName) => {
        const all = Storage.get('prompts');
        const idx = all.findIndex(p => p.id === promptId);
        if (idx >= 0 && newName.trim()) {
            all[idx].name = newName.trim();
            all[idx].updatedAt = new Date().toISOString();
            Storage.set('prompts', all);
            refreshPrompts();
        }
    }, [refreshPrompts]);

    // Add message
    const addMessage = useCallback((text, role) => {
        const newMsg = { id: generateId(), text, role, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, newMsg]);
        return newMsg;
    }, []);

    // Show undo notification
    const showUndoNotification = useCallback(() => {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoNotification(true);
        undoTimeoutRef.current = setTimeout(() => setUndoNotification(false), 5000);
    }, []);

    // Hide undo notification
    const hideUndoNotification = useCallback(() => {
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setUndoNotification(false);
    }, []);

    // Delete message
    const deleteMessage = useCallback((messageId) => {
        setMessages(prev => {
            const idx = prev.findIndex(m => m.id === messageId);
            if (idx >= 0) {
                undoStackRef.current.push({ type: 'delete', message: prev[idx], index: idx });
            }
            return prev.filter(m => m.id !== messageId);
        });
        showUndoNotification();
    }, [showUndoNotification]);

    // Edit message
    const editMessage = useCallback((messageId, newText) => {
        setMessages(prev => prev.map(m => {
            if (m.id === messageId) {
                undoStackRef.current.push({ type: 'edit', messageId, oldText: m.text });
                return { ...m, text: newText, originalText: m.text };
            }
            return m;
        }));
        setEditingMessageId(null);
        showUndoNotification();
    }, [showUndoNotification]);

    // Undo last action
    const undo = useCallback(() => {
        const action = undoStackRef.current.pop();
        if (!action) return;
        if (action.type === 'delete') {
            setMessages(prev => {
                const copy = [...prev];
                copy.splice(action.index, 0, action.message);
                return copy;
            });
        } else if (action.type === 'edit') {
            setMessages(prev => prev.map(m => 
                m.id === action.messageId ? { ...m, text: action.oldText } : m
            ));
        } else if (action.type === 'system-prompt') {
            setMessages(prev => {
                const systemMsg = prev.find(m => m.role === 'system');
                if (action.hadSystem) {
                    // Restore old text
                    if (systemMsg) {
                        return prev.map(m => 
                            m.role === 'system' ? { ...m, text: action.oldText } : m
                        );
                    } else {
                        // System message was deleted, restore it
                        return [{ 
                            id: action.systemMessageId || 'system-' + Date.now(), 
                            text: action.oldText, 
                            role: 'system', 
                            timestamp: new Date().toISOString() 
                        }, ...prev];
                    }
                } else {
                    // System message didn't exist before, remove it
                    return prev.filter(m => m.role !== 'system');
                }
            });
        }
        hideUndoNotification();
    }, [hideUndoNotification]);

    // Send message and get AI response
    const sendMessage = useCallback(async (text, role) => {
        if (!text.trim() || isResponding) return;

        if (!currentPromptId) {
            createPrompt();
        }

        const userMsg = addMessage(text, role);
        
        if (role !== 'user') {
            setSenderRole('user');
            return;
        }

        setIsResponding(true);
        try {
            const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.text }));
            const actualService = config.service === 'local' ? 'ollama' : config.service;
            const llmOptions = {
                aiService: actualService,
                model: config.model,
                ...(getApiKey(actualService) && { apiKey: getApiKey(actualService) }),
                ...(config.temperature && { temperature: parseFloat(config.temperature) }),
                ...(config.maxTokens && { maxTokens: parseInt(config.maxTokens, 10) }),
                ...(config.topP && { topP: parseFloat(config.topP) }),
                ...(config.responseMode === 'json' && { responseFormat: { type: 'json_object' } })
            };
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationHistory: history, llmOptions })
            });
            const data = await response.json();
            
            if (data.success && data.response) {
                addMessage(data.response, 'assistant');
            } else {
                addMessage(`Error: ${data.error || 'No response'}`, 'assistant');
            }
        } catch (error) {
            addMessage(`Error: ${error.message}`, 'assistant');
        } finally {
            setIsResponding(false);
        }
    }, [isResponding, currentPromptId, createPrompt, addMessage, messages, config]);

    // Save version
    const saveVersion = useCallback((notes = '') => {
        if (!currentPromptId || messages.length === 0) return;
        const versions = getVersions(currentPromptId);
        const versionId = `v${versions.length + 1}`;
        const now = new Date().toISOString();
        const versionMessageCount = messages.filter(m => m.role !== 'system').length;
        
        Storage.set('versions', [...Storage.get('versions'), {
            id: versionId, promptId: currentPromptId, messages, config,
            parentVersionId: null, notes, createdAt: now
        }]);
        
        const all = Storage.get('conversations');
        const idx = all.findIndex(c => c.id === activeConversationId);
        if (idx >= 0) {
            all[idx].origin = { 
                type: 'version', 
                sourceId: versionId,
                versionMessageCount 
            };
            Storage.set('conversations', all);
        }
        
        setMessages([...messages]);
    }, [currentPromptId, activeConversationId, messages, config, getVersions]);

    // Load version
    const loadVersion = useCallback((versionId) => {
        const version = Storage.get('versions').find(v => 
            v.id === versionId && v.promptId === currentPromptId
        );
        if (!version) return;
        
        const versionMessageCount = (version.messages || []).filter(m => m.role !== 'system').length;
        
        const convId = 'conv-' + generateId();
        const now = new Date().toISOString();
        Storage.set('conversations', [...Storage.get('conversations'), {
            id: convId, promptId: currentPromptId,
            messages: version.messages, config: version.config || {},
            origin: { type: 'version', sourceId: versionId, versionMessageCount },
            createdAt: now, updatedAt: now
        }]);
        
        loadConversation(convId);
    }, [currentPromptId, loadConversation]);

    // Delete version
    const deleteVersion = useCallback((versionId) => {
        if (!confirm(`Delete ${versionId}?`)) return;
        Storage.set('versions', Storage.get('versions').filter(v => 
            !(v.id === versionId && v.promptId === currentPromptId)
        ));
    }, [currentPromptId]);

    // New conversation
    const newConversation = useCallback(() => {
        saveConversation();
        const convId = 'conv-' + generateId();
        const now = new Date().toISOString();
        Storage.set('conversations', [...Storage.get('conversations'), {
            id: convId, promptId: currentPromptId, messages: [], config: {},
            origin: { type: 'fresh' }, createdAt: now, updatedAt: now
        }]);
        setActiveConversationId(convId);
        setMessages([]);
    }, [currentPromptId, saveConversation]);

    // Switch conversation
    const switchConversation = useCallback((convId) => {
        saveConversation();
        loadConversation(convId);
    }, [saveConversation, loadConversation]);

    // Delete conversation
    const deleteConversation = useCallback((convId) => {
        const convs = getConversations(currentPromptId);
        if (convId === activeConversationId && convs.length === 1) {
            if (!confirm('Delete this conversation?')) return;
        }
        Storage.set('conversations', Storage.get('conversations').filter(c => c.id !== convId));
        if (convId === activeConversationId) {
            const remaining = getConversations(currentPromptId);
            if (remaining.length > 0) loadConversation(remaining[0].id);
            else newConversation();
        }
    }, [currentPromptId, activeConversationId, getConversations, loadConversation, newConversation]);

    // Branch at message
    const branchAtMessage = useCallback((messageId) => {
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) return;
        
        saveConversation();
        const convId = 'conv-' + generateId();
        const now = new Date().toISOString();
        const branchedMessages = messages.slice(0, idx + 1).map(m => ({
            ...m, id: generateId()
        }));
        
        Storage.set('conversations', [...Storage.get('conversations'), {
            id: convId, promptId: currentPromptId, messages: branchedMessages,
            config, origin: { type: 'branch', sourceId: activeConversationId },
            createdAt: now, updatedAt: now
        }]);
        
        loadConversation(convId);
    }, [messages, currentPromptId, activeConversationId, config, saveConversation, loadConversation]);

    // Set system prompt
    const setSystemPrompt = useCallback((text) => {
        setMessages(prev => {
            const systemMsg = prev.find(m => m.role === 'system');
            const oldText = systemMsg?.text || '';
            const hasSystem = !!systemMsg;
            
            // Store undo action
            if (text.trim() !== oldText.trim()) {
                undoStackRef.current.push({ 
                    type: 'system-prompt', 
                    oldText: oldText,
                    hadSystem: hasSystem,
                    systemMessageId: systemMsg?.id
                });
            }
            
            if (text.trim()) {
                if (hasSystem) {
                    return prev.map(m => m.role === 'system' ? { ...m, text } : m);
                }
                return [{ id: 'system-' + Date.now(), text, role: 'system', timestamp: new Date().toISOString() }, ...prev];
            }
            return prev.filter(m => m.role !== 'system');
        });
        showUndoNotification();
    }, [showUndoNotification]);

    // Get current prompt
    const currentPrompt = useMemo(() => 
        prompts.find(p => p.id === currentPromptId), 
        [prompts, currentPromptId]
    );

    // Auto-save
    useEffect(() => {
        const interval = setInterval(saveConversation, 30000);
        window.addEventListener('beforeunload', saveConversation);
        return () => {
            clearInterval(interval);
            window.removeEventListener('beforeunload', saveConversation);
        };
    }, [saveConversation]);

    // Initial load
    useEffect(() => {
        refreshPrompts();
        const existing = Storage.get('prompts');
        if (existing.length > 0) {
            openPrompt(existing[0].id);
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [undo]);

    // Click outside to save/close editing
    useEffect(() => {
        const handler = (e) => {
            if (!editingMessageId) return;
            
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
            
            setEditingMessageId(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [editingMessageId]);

    const value = {
        // State
        prompts, currentPromptId, currentPrompt, activeConversationId,
        messages, config, isResponding, settingsOpen, senderRole,
        editingMessageId, undoNotification,
        // Setters
        setConfig, setSettingsOpen, setSenderRole, setEditingMessageId,
        // Actions
        createPrompt, openPrompt, deletePrompt, renamePrompt,
        sendMessage, addMessage, deleteMessage, editMessage,
        saveVersion, loadVersion, deleteVersion,
        newConversation, switchConversation, deleteConversation,
        branchAtMessage, setSystemPrompt, saveConversation, undo,
        getVersions, getConversations, getBestVersion, toggleBestVersion, refreshPrompts, hideUndoNotification
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
