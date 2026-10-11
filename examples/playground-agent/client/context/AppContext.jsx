/**
 * App Provider - global state (context + hook live in context.js for Fast Refresh)
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppContext } from './context';
import {
    Storage,
    generateId,
    API_URL,
    TOOL_DECISION_API_URL,
    ABORT_API_URL,
    getApiKey,
    THEME_STORAGE_KEY,
    buildExportPayload,
    serializeToJson,
    serializeToText,
    parseImportFile,
    sanitizeMessagesForImport,
    messagesForExport,
    downloadText,
    suggestedExportFilename
} from '../utils';
import { useServerHealth } from '../hooks/useServerHealth';

/**
 * Formats a chat/API failure for an assistant bubble, with a clearer aborted label.
 */
function formatChatFailureText(dataOrError, wasAborted) {
    if (wasAborted || dataOrError?.aborted) {
        return 'Request stopped';
    }
    const message = typeof dataOrError === 'string'
        ? dataOrError
        : (dataOrError?.error || dataOrError?.message || 'No response');
    if (/aborted|cancelled/i.test(message)) {
        return 'Request stopped';
    }
    return `Error: ${message}`;
}

/**
 * Determines which config sections changed between two config objects.
 */
function getConfigChangeSections(prevConfig, nextConfig) {
    const MODEL_KEYS = ['service', 'model', 'temperature', 'maxTokens', 'topP', 'responseFormat'];
    const RESILIENCE_KEYS = [
        'retries',
        'backoffFactor',
        'timeout',
        'requestsPerMinute',
        'llmTokensPerMinute',
        'circuitBreakerFailureThreshold',
        'circuitBreakerCooldownPeriod',
        'maxConcurrent',
        'enableCache'
    ];

    const changed = (key) => {
        const a = prevConfig?.[key];
        const b = nextConfig?.[key];
        return JSON.stringify(a) !== JSON.stringify(b);
    };

    const TOOL_KEYS = ['webSearchEnabled', 'readPageEnabled', 'searchProvider'];

    return {
        modelsChanged: MODEL_KEYS.some(changed),
        resilienceChanged: RESILIENCE_KEYS.some(changed),
        toolsChanged: TOOL_KEYS.some(changed)
    };
}

/**
 * Maps API `content` (same shape as `llm.chat().content`) to a single string for the message bubble.
 */
function formatAssistantContentForDisplay(content) {
    if (content == null) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
        try {
            return JSON.stringify(content, null, 2);
        } catch {
            return String(content);
        }
    }
    return String(content);
}

/**
 * One-line record of a tool the model asked to call. Used when the assistant
 * message has no text, so the next turn still shows that a call was requested.
 */
function describeToolCall(call, approval) {
    const name = call?.function?.name || call?.name || 'tool';
    const args = call?.function?.arguments ?? call?.input ?? call?.arguments ?? '';
    const argsText = typeof args === 'string' ? args : JSON.stringify(args);
    if (approval === 'failed') {
        return `Tool ${name}(${argsText}) failed.`;
    }
    if (typeof call?.result === 'string' && call.result) {
        return `Tool ${name}(${argsText}) returned:\n${call.result}`;
    }
    if (approval === 'approved') {
        return `User approved tool ${name}(${argsText}). The tool was not run.`;
    }
    if (approval === 'denied') {
        return `User denied tool ${name}(${argsText}).`;
    }
    return `Requested tool ${name}(${argsText}). Waiting for approval.`;
}

/** True when every call already has a result string from the server. */
function toolCallsWereRun(toolCalls) {
    return toolCalls.every((call) => typeof call?.result === 'string' && call.result.trim().length > 0);
}

/** True when the user can still approve or deny this message. */
function toolCallCanBeDecided(message) {
    const calls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
    if (!calls.length || message.toolApproval === 'running') return false;
    if (message.toolApproval === 'pending' || message.toolApproval === 'failed') return true;
    return message.toolApproval === 'approved' && !toolCallsWereRun(calls);
}

/**
 * A reload cannot finish a search that was still running, and an approved call
 * with no result text never actually returned anything. Both go back to pending.
 * @param {object[]} messages
 * @returns {object[]}
 */
function settleInterruptedToolCalls(messages) {
    return messages.map((message) => {
        const calls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
        if (!calls.length) return message;
        const interrupted = message.toolApproval === 'running'
            || (message.toolApproval === 'approved' && !toolCallsWereRun(calls));
        if (!interrupted) return message;
        return { ...message, toolApproval: 'pending', toolError: undefined };
    });
}

/** Copies server tool results onto the calls that were approved. */
function applyToolResults(calls, toolResults) {
    const list = Array.isArray(toolResults) ? toolResults : [];
    const byId = new Map(list.map((item) => [String(item?.id), item]));
    return calls.map((call) => {
        const match = byId.get(String(call?.id));
        if (!match) return call;
        return {
            ...call,
            result: typeof match.result === 'string' ? match.result : '',
            decision: match.decision
        };
    });
}

/** Fields stored on an assistant message when the model asked to call tools. */
function toolCallFields(toolCalls) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return {};
    return {
        toolCalls,
        toolApproval: toolCallsWereRun(toolCalls) ? 'approved' : 'pending'
    };
}

/**
 * Maps stored chat messages to the conversation array sent to the model.
 */
function toConversationHistory(messages) {
    return messages.map((message) => {
        const text = typeof message.text === 'string' ? message.text : '';
        const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
        if (calls.length === 0) {
            return { role: message.role, content: text };
        }
        const callText = calls.map((call) => describeToolCall(call, message.toolApproval)).join('\n');
        const failure = message.toolApproval === 'failed' && message.toolError
            ? `${callText}\n${message.toolError}`
            : callText;
        return { role: message.role, content: text ? `${text}\n\n${failure}` : failure };
    });
}

/**
 * Search backend for this chat. Tavily also sends the key stored in the browser.
 * @param {object} config
 * @returns {{ searchProvider: string, searchApiKey?: string }}
 */
function playgroundSearchOptions(config) {
    const provider = config.searchProvider === 'tavily' ? 'tavily' : 'duckduckgo';
    const apiKey = provider === 'tavily' ? getApiKey('tavily') : '';
    return {
        searchProvider: provider,
        ...(apiKey ? { searchApiKey: apiKey } : {})
    };
}

/** Chat options the playground sends with each model request. */
function buildPlaygroundLlmOptions(config, overrides = {}) {
    const actualService = config.service === 'local' ? 'ollama' : config.service;
    return {
        aiService: actualService,
        model: config.model,
        ...(getApiKey(actualService) && { apiKey: getApiKey(actualService) }),
        ...(config.temperature && { temperature: parseFloat(config.temperature) }),
        ...(config.maxTokens && { maxTokens: parseInt(config.maxTokens, 10) }),
        ...(config.topP && { topP: parseFloat(config.topP) }),
        ...(config.responseFormat === 'json' && { responseFormat: { type: 'json_object' } }),
        ...(config.retries && { retries: parseInt(config.retries, 10) }),
        ...(config.backoffFactor && { backoffFactor: parseFloat(config.backoffFactor) }),
        ...(config.timeout && { timeout: parseInt(config.timeout, 10) }),
        ...(config.requestsPerMinute || config.llmTokensPerMinute ? {
            rateLimitConfig: {
                ...(config.requestsPerMinute && { requestsPerMinute: parseInt(config.requestsPerMinute, 10) }),
                ...(config.llmTokensPerMinute && { llmTokensPerMinute: parseInt(config.llmTokensPerMinute, 10) })
            }
        } : {}),
        ...(config.circuitBreakerFailureThreshold || config.circuitBreakerCooldownPeriod ? {
            circuitBreakerConfig: {
                ...(config.circuitBreakerFailureThreshold && { failureThreshold: parseInt(config.circuitBreakerFailureThreshold, 10) }),
                ...(config.circuitBreakerCooldownPeriod && { cooldownPeriod: parseInt(config.circuitBreakerCooldownPeriod, 10) })
            }
        } : {}),
        ...(config.maxConcurrent && config.maxConcurrent.trim() && { maxConcurrent: parseInt(config.maxConcurrent, 1) }),
        enableCache: config.enableCache !== false,
        webSearchEnabled: config.webSearchEnabled !== false,
        readPageEnabled: config.readPageEnabled !== false,
        ...playgroundSearchOptions(config),
        ...overrides
    };
}

/** Writes a conversation's messages to local storage. */
function storeConversationMessages(conversationId, messages) {
    if (!conversationId) return;
    const all = Storage.get('conversations');
    const idx = all.findIndex(c => c.id === conversationId);
    if (idx < 0) return;
    all[idx].messages = messages;
    all[idx].updatedAt = new Date().toISOString();
    Storage.set('conversations', all);
}

/**
 * App Provider - wraps the application with global state
 */
export function AppProvider({ children }) {
    const { serverHealth, refreshServerHealth, reportApiSuccess, reportApiFailure } = useServerHealth();
    const [prompts, setPrompts] = useState([]);
    const [currentPromptId, setCurrentPromptId] = useState(null);
    const [activeConversationId, setActiveConversationId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [config, setConfig] = useState({
        service: 'openai', model: 'gpt-5-nano', temperature: '0.7',
        maxTokens: '2048', responseFormat: 'text',
        // Resilience settings
        retries: '3',
        backoffFactor: '2',
        timeout: '60000',
        requestsPerMinute: '60',
        llmTokensPerMinute: '90000',
        circuitBreakerFailureThreshold: '5',
        circuitBreakerCooldownPeriod: '30000',
        maxConcurrent: '',
        enableCache: true,
        webSearchEnabled: true,
        readPageEnabled: true,
        searchProvider: 'duckduckgo'
    });
    const [isResponding, setIsResponding] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsDefaultSection, setSettingsDefaultSection] = useState('models'); // 'models' or 'resilience'
    const [senderRole, setSenderRole] = useState('user');
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [undoNotification, setUndoNotification] = useState(null);
    const [configSavedModels, setConfigSavedModels] = useState(false);
    const [configSavedResilience, setConfigSavedResilience] = useState(false);
    const [configSavedTools, setConfigSavedTools] = useState(false);
    const [currentRoute, setCurrentRoute] = useState('playground'); // 'playground' or 'token-bucket'
    const [selectedActivityMessageId, setSelectedActivityMessageId] = useState(null);
    const [isBackendPanelOpen, setIsBackendPanelOpen] = useState(false);
    const [theme, setThemeState] = useState(() => {
        try {
            const stored = localStorage.getItem(THEME_STORAGE_KEY);
            return stored === 'dark' ? 'dark' : 'light';
        } catch {
            return 'light';
        }
    });
    const undoStackRef = useRef([]);
    const undoTimeoutRef = useRef(null);
    const previousConfigRef = useRef(null);
    const messagesRef = useRef([]);
    const activeConversationIdRef = useRef(null);
    const currentPromptIdRef = useRef(null);
    const requestSeqRef = useRef(0);
    const abortRequestedRef = useRef(false);

    useEffect(() => {
        activeConversationIdRef.current = activeConversationId;
        currentPromptIdRef.current = currentPromptId;
    }, [activeConversationId, currentPromptId]);

    /**
     * Persists a message to a specific conversation in storage (even if not active).
     */
    const persistMessageToConversation = useCallback((conversationId, msg) => {
        if (!conversationId || !msg) return false;
        const all = Storage.get('conversations');
        const idx = all.findIndex(c => c.id === conversationId);
        if (idx < 0) return false;
        const prev = all[idx].messages || [];
        all[idx].messages = [...prev, msg];
        all[idx].updatedAt = new Date().toISOString();
        Storage.set('conversations', all);
        return true;
    }, []);

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
            const loadedMessages = settleInterruptedToolCalls(conv.messages || []);
            setMessages(loadedMessages);
            messagesRef.current = loadedMessages;
            setActiveConversationId(conversationId);
            if (conv.config) {
                const newConfig = { ...config, ...conv.config };
                if (newConfig.webSearchEnabled === undefined) {
                    newConfig.webSearchEnabled = true;
                }
                if (newConfig.readPageEnabled === undefined) {
                    newConfig.readPageEnabled = true;
                }
                if (newConfig.searchProvider !== 'tavily' && newConfig.searchProvider !== 'duckduckgo') {
                    newConfig.searchProvider = 'duckduckgo';
                }
                setConfig(newConfig);
                previousConfigRef.current = { ...newConfig };
            } else {
                previousConfigRef.current = { ...config };
            }
        }
    }, [config]);

    // Save current conversation
    const saveConversation = useCallback(() => {
        if (!activeConversationId) return;
        const all = Storage.get('conversations');
        const idx = all.findIndex(c => c.id === activeConversationId);
        if (idx >= 0) {
            const configChanged = JSON.stringify(previousConfigRef.current) !== JSON.stringify(config);
            all[idx].messages = messagesRef.current ?? messages;
            all[idx].config = config;
            all[idx].updatedAt = new Date().toISOString();
            Storage.set('conversations', all);
            
            // Trigger pulse if config changed
            if (configChanged) {
                const { modelsChanged, resilienceChanged, toolsChanged } = getConfigChangeSections(previousConfigRef.current, config);
                previousConfigRef.current = { ...config };
                if (modelsChanged) {
                    setConfigSavedModels(true);
                    setTimeout(() => setConfigSavedModels(false), 100);
                }
                if (resilienceChanged) {
                    setConfigSavedResilience(true);
                    setTimeout(() => setConfigSavedResilience(false), 100);
                }
                if (toolsChanged) {
                    setConfigSavedTools(true);
                    setTimeout(() => setConfigSavedTools(false), 100);
                }
            }
        }
    }, [activeConversationId, messages, config]);

    /**
     * Turns one agent tool on or off for the active chat.
     * While the settings drawer is open, the drawer save or cancel owns persistence.
     */
    const setToolEnabled = useCallback((key, enabled) => {
        setConfig(prev => ({ ...prev, [key]: enabled }));
        if (settingsOpen) return;
        if (previousConfigRef.current) {
            previousConfigRef.current = { ...previousConfigRef.current, [key]: enabled };
        }
        setConfigSavedTools(true);
        setTimeout(() => setConfigSavedTools(false), 100);
        const conversationId = activeConversationIdRef.current;
        if (!conversationId) return;
        const all = Storage.get('conversations');
        const idx = all.findIndex(c => c.id === conversationId);
        if (idx < 0) return;
        all[idx].config = { ...(all[idx].config || {}), [key]: enabled };
        all[idx].updatedAt = new Date().toISOString();
        Storage.set('conversations', all);
    }, [settingsOpen]);

    /** Turns web_search on or off for the active chat. */
    const setWebSearchEnabled = useCallback((enabled) => {
        setToolEnabled('webSearchEnabled', enabled);
    }, [setToolEnabled]);

    /** Turns read_page on or off for the active chat. */
    const setReadPageEnabled = useCallback((enabled) => {
        setToolEnabled('readPageEnabled', enabled);
    }, [setToolEnabled]);

    /**
     * Sends approve or deny for each tool id so the server can resume that model turn.
     */
    const submitToolDecision = useCallback(async (messageId, decidedMessages, decision) => {
        const message = decidedMessages.find(m => m.id === messageId);
        const calls = message?.toolCalls || [];
        const originConversationId = activeConversationIdRef.current;
        if (!calls.length || calls.some(call => !call?.id)) {
            const failed = decidedMessages.map(m => {
                if (m.id !== messageId) return m;
                return {
                    ...m,
                    toolApproval: 'failed',
                    toolError: 'Tool call is missing an id, so the turn cannot continue.'
                };
            });
            storeConversationMessages(originConversationId, failed);
            messagesRef.current = failed;
            setMessages(failed);
            return;
        }

        setIsResponding(true);
        abortRequestedRef.current = false;
        const messageIndex = decidedMessages.findIndex(m => m.id === messageId);
        try {
            const response = await fetch(TOOL_DECISION_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    decisions: calls.map(call => ({ id: call.id, decision })),
                    toolCalls: calls,
                    conversationHistory: toConversationHistory(decidedMessages.slice(0, messageIndex)),
                    llmOptions: buildPlaygroundLlmOptions(config),
                    content: message.text ?? null
                })
            });
            const data = await response.json();
            if (!response.ok) {
                reportApiFailure(new Error(data.error || 'Tool call failed'));
            } else {
                reportApiSuccess();
            }
            const wasAborted = abortRequestedRef.current || data.aborted;
            const stillHere = originConversationId && originConversationId === activeConversationIdRef.current;
            const source = stillHere ? messagesRef.current : decidedMessages;
            if (!source.some(m => m.id === messageId)) return;

            if (data.toolFailed) {
                const failed = source.map(m => {
                    if (m.id !== messageId) return m;
                    return {
                        ...m,
                        toolApproval: 'failed',
                        toolError: data.error || 'Tool call failed'
                    };
                });
                storeConversationMessages(originConversationId, failed);
                if (stillHere) {
                    messagesRef.current = failed;
                    setMessages(failed);
                }
                return;
            }

            let next = source.map(m => {
                if (m.id !== messageId) return m;
                const toolCalls = applyToolResults(m.toolCalls || [], data.toolResults);
                const unfinished = decision === 'approved' && !toolCallsWereRun(toolCalls);
                return {
                    ...m,
                    toolApproval: unfinished ? 'failed' : 'approved',
                    toolError: unfinished ? (data.error || 'The tool finished without a result.') : undefined,
                    toolCalls
                };
            });
            const assistantMsg = {
                id: generateId(),
                text: data.success
                    ? (formatAssistantContentForDisplay(data.content) ?? '')
                    : formatChatFailureText(data, wasAborted),
                role: 'assistant',
                timestamp: new Date().toISOString(),
                ...toolCallFields(data.toolCalls),
                ...(data.metadata && { metadata: { operation: data.metadata } })
            };
            next = [...next, assistantMsg];
            storeConversationMessages(originConversationId, next);
            if (stillHere) {
                messagesRef.current = next;
                setMessages(next);
                if (data.metadata) setSelectedActivityMessageId(assistantMsg.id);
            }
        } catch (error) {
            reportApiFailure(error);
            const stillHere = originConversationId && originConversationId === activeConversationIdRef.current;
            const source = stillHere ? messagesRef.current : decidedMessages;
            const failed = source.map(m => {
                if (m.id !== messageId) return m;
                return {
                    ...m,
                    toolApproval: 'failed',
                    toolError: error?.message || 'Tool call failed'
                };
            });
            storeConversationMessages(originConversationId, failed);
            if (stillHere) {
                messagesRef.current = failed;
                setMessages(failed);
            }
        } finally {
            abortRequestedRef.current = false;
            setIsResponding(false);
        }
    }, [config, reportApiSuccess, reportApiFailure]);

    /**
     * Records approve or deny, then resumes the staged model turn by tool id.
     */
    const decideToolCall = useCallback((messageId, approval) => {
        if (approval !== 'approved' && approval !== 'denied') return;
        if (isResponding) return;
        let updatedMessages = null;
        setMessages(prev => {
            const updated = prev.map(m => {
                if (m.id !== messageId || !toolCallCanBeDecided(m)) return m;
                return { ...m, toolApproval: 'running', toolError: undefined };
            });
            messagesRef.current = updated;
            updatedMessages = updated;
            storeConversationMessages(activeConversationIdRef.current, updated);
            return updated;
        });
        if (!updatedMessages) return;
        const message = updatedMessages.find(m => m.id === messageId);
        if (!message || message.toolApproval !== 'running') return;
        void submitToolDecision(messageId, updatedMessages, approval);
    }, [isResponding, submitToolDecision]);

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
        messagesRef.current = [];
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
            messagesRef.current = [];
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

    // Add message (optional meta e.g. metadata for empty-response hints)
    const addMessage = useCallback((text, role, meta) => {
        const newMsg = {
            id: generateId(),
            text: text ?? '',
            role,
            timestamp: new Date().toISOString(),
            ...(meta && { metadata: meta })
        };
        setMessages(prev => {
            const updated = [...prev, newMsg];
            messagesRef.current = updated;
            return updated;
        });
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
            const updated = prev.filter(m => m.id !== messageId);
            messagesRef.current = updated;
            return updated;
        });
        showUndoNotification();
    }, [showUndoNotification]);

    // Edit message
    const editMessage = useCallback((messageId, newText) => {
        setMessages(prev => {
            const updated = prev.map(m => {
                if (m.id === messageId) {
                    undoStackRef.current.push({ type: 'edit', messageId, oldText: m.text });
                    return { ...m, text: newText, originalText: m.text };
                }
                return m;
            });
            messagesRef.current = updated;
            return updated;
        });
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
                messagesRef.current = copy;
                return copy;
            });
        } else if (action.type === 'edit') {
            setMessages(prev => {
                const updated = prev.map(m => 
                    m.id === action.messageId ? { ...m, text: action.oldText } : m
                );
                messagesRef.current = updated;
                return updated;
            });
        } else if (action.type === 'system-prompt') {
            setMessages(prev => {
                const systemMsg = prev.find(m => m.role === 'system');
                let updated;
                if (action.hadSystem) {
                    // Restore old text
                    if (systemMsg) {
                        updated = prev.map(m => 
                            m.role === 'system' ? { ...m, text: action.oldText } : m
                        );
                    } else {
                        // System message was deleted, restore it
                        updated = [{ 
                            id: action.systemMessageId || 'system-' + Date.now(), 
                            text: action.oldText, 
                            role: 'system', 
                            timestamp: new Date().toISOString() 
                        }, ...prev];
                    }
                } else {
                    // System message didn't exist before, remove it
                    updated = prev.filter(m => m.role !== 'system');
                }
                messagesRef.current = updated;
                return updated;
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

        const requestId = `req-${++requestSeqRef.current}`;
        const originConversationId = activeConversationIdRef.current;
        const originPromptId = currentPromptIdRef.current;

        // Normalize role: default to 'user' to prevent accidental assistant messages
        // This fixes the bug where senderRole state might be corrupted
        const actualRole = (role === 'assistant') ? 'assistant' : 'user';
        const userMsg = addMessage(text, actualRole);
        
        // Reset senderRole to 'user' after sending (unless it was intentionally set to assistant)
        // This ensures the next message defaults to 'user'
        if (role !== 'assistant') {
            setSenderRole('user');
        }
        
        // If role is not 'user', don't send to API (user manually added assistant message)
        if (actualRole !== 'user') {
            return;
        }

        setIsResponding(true);
        abortRequestedRef.current = false;
        try {
            // Use messagesRef to get the latest messages (includes the just-added userMsg)
            // This fixes the stale closure issue
            const history = toConversationHistory(messagesRef.current);
            const actualService = config.service === 'local' ? 'ollama' : config.service;
            const llmOptions = {
                aiService: actualService,
                model: config.model,
                ...(getApiKey(actualService) && { apiKey: getApiKey(actualService) }),
                ...(config.temperature && { temperature: parseFloat(config.temperature) }),
                ...(config.maxTokens && { maxTokens: parseInt(config.maxTokens, 10) }),
                ...(config.topP && { topP: parseFloat(config.topP) }),
                ...(config.responseFormat === 'json' && { responseFormat: { type: 'json_object' } }),
                // Resilience settings
                ...(config.retries && { retries: parseInt(config.retries, 10) }),
                ...(config.backoffFactor && { backoffFactor: parseFloat(config.backoffFactor) }),
                ...(config.timeout && { timeout: parseInt(config.timeout, 10) }),
                ...(config.requestsPerMinute || config.llmTokensPerMinute ? {
                    rateLimitConfig: {
                        ...(config.requestsPerMinute && { requestsPerMinute: parseInt(config.requestsPerMinute, 10) }),
                        ...(config.llmTokensPerMinute && { llmTokensPerMinute: parseInt(config.llmTokensPerMinute, 10) })
                    }
                } : {}),
                ...(config.circuitBreakerFailureThreshold || config.circuitBreakerCooldownPeriod ? {
                    circuitBreakerConfig: {
                        ...(config.circuitBreakerFailureThreshold && { failureThreshold: parseInt(config.circuitBreakerFailureThreshold, 10) }),
                        ...(config.circuitBreakerCooldownPeriod && { cooldownPeriod: parseInt(config.circuitBreakerCooldownPeriod, 10) })
                    }
                } : {}),
                ...(config.maxConcurrent && config.maxConcurrent.trim() && { maxConcurrent: parseInt(config.maxConcurrent, 1) }),
                enableCache: config.enableCache !== false,
                webSearchEnabled: config.webSearchEnabled !== false,
                readPageEnabled: config.readPageEnabled !== false,
                ...playgroundSearchOptions(config)
            };
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationHistory: history, llmOptions })
            });
            reportApiSuccess();
            const data = await response.json();
            
            const targetConversationId = originConversationId;
            const shouldApplyToActiveUI = targetConversationId && targetConversationId === activeConversationIdRef.current;
            const wasAborted = abortRequestedRef.current || data.aborted;

            if (data.success) {
                const assistantText = formatAssistantContentForDisplay(data.content);
                const meta = data.metadata ? { operation: data.metadata } : undefined;
                const assistantMsg = {
                    id: generateId(),
                    text: assistantText ?? '',
                    role: 'assistant',
                    timestamp: new Date().toISOString(),
                    ...toolCallFields(data.toolCalls),
                    ...(meta && { metadata: meta })
                };

                persistMessageToConversation(targetConversationId, assistantMsg);
                if (shouldApplyToActiveUI) {
                    setMessages(prev => {
                        const updated = [...prev, assistantMsg];
                        messagesRef.current = updated;
                        return updated;
                    });
                    if (meta?.operation) setSelectedActivityMessageId(assistantMsg.id);
                }
            } else {
                const meta = data.metadata ? { operation: data.metadata } : undefined;
                const assistantMsg = {
                    id: generateId(),
                    text: formatChatFailureText(data, wasAborted),
                    role: 'assistant',
                    timestamp: new Date().toISOString(),
                    ...(meta && { metadata: meta })
                };

                persistMessageToConversation(targetConversationId, assistantMsg);
                if (shouldApplyToActiveUI) {
                    setMessages(prev => {
                        const updated = [...prev, assistantMsg];
                        messagesRef.current = updated;
                        return updated;
                    });
                    if (meta?.operation) setSelectedActivityMessageId(assistantMsg.id);
                }
            }
        } catch (error) {
            reportApiFailure(error);
            addMessage(formatChatFailureText(error, abortRequestedRef.current), 'assistant');
        } finally {
            abortRequestedRef.current = false;
            setIsResponding(false);
        }
    }, [isResponding, currentPromptId, createPrompt, addMessage, config, persistMessageToConversation, reportApiSuccess, reportApiFailure]);

    /** Ask the playground server to abort the in-flight ResilientLLM request. */
    const abortRequest = useCallback(async () => {
        if (!isResponding) return;
        abortRequestedRef.current = true;
        try {
            await fetch(ABORT_API_URL, { method: 'POST' });
            reportApiSuccess();
        } catch (error) {
            reportApiFailure(error);
        }
    }, [isResponding, reportApiSuccess, reportApiFailure]);

    // Regenerate assistant message
    const regenerateMessage = useCallback(async (messageId) => {
        if (isResponding) return;

        // Use messagesRef to get the latest messages
        const currentMessages = messagesRef.current;
        const messageIndex = currentMessages.findIndex(m => m.id === messageId);
        if (messageIndex === -1) return;

        const message = currentMessages[messageIndex];
        if (message.role !== 'assistant') return;

        // Build conversation history up to (but not including) this assistant message
        const history = toConversationHistory(currentMessages.slice(0, messageIndex));

        setIsResponding(true);
        abortRequestedRef.current = false;
        try {
            const actualService = config.service === 'local' ? 'ollama' : config.service;
            const llmOptions = {
                aiService: actualService,
                model: config.model,
                ...(getApiKey(actualService) && { apiKey: getApiKey(actualService) }),
                ...(config.temperature && { temperature: parseFloat(config.temperature) }),
                ...(config.maxTokens && { maxTokens: parseInt(config.maxTokens, 10) }),
                ...(config.topP && { topP: parseFloat(config.topP) }),
                ...(config.responseFormat === 'json' && { responseFormat: { type: 'json_object' } }),
                // Resilience settings
                ...(config.retries && { retries: parseInt(config.retries, 10) }),
                ...(config.backoffFactor && { backoffFactor: parseFloat(config.backoffFactor) }),
                ...(config.timeout && { timeout: parseInt(config.timeout, 10) }),
                ...(config.requestsPerMinute || config.llmTokensPerMinute ? {
                    rateLimitConfig: {
                        ...(config.requestsPerMinute && { requestsPerMinute: parseInt(config.requestsPerMinute, 10) }),
                        ...(config.llmTokensPerMinute && { llmTokensPerMinute: parseInt(config.llmTokensPerMinute, 10) })
                    }
                } : {}),
                ...(config.circuitBreakerFailureThreshold || config.circuitBreakerCooldownPeriod ? {
                    circuitBreakerConfig: {
                        ...(config.circuitBreakerFailureThreshold && { failureThreshold: parseInt(config.circuitBreakerFailureThreshold, 10) }),
                        ...(config.circuitBreakerCooldownPeriod && { cooldownPeriod: parseInt(config.circuitBreakerCooldownPeriod, 10) })
                    }
                } : {}),
                ...(config.maxConcurrent && config.maxConcurrent.trim() && { maxConcurrent: parseInt(config.maxConcurrent, 1) }),
                // Regenerate always bypasses cache for this single request
                enableCache: false,
                webSearchEnabled: config.webSearchEnabled !== false,
                readPageEnabled: config.readPageEnabled !== false,
                ...playgroundSearchOptions(config)
            };
            
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationHistory: history, llmOptions })
            });
            reportApiSuccess();
            const data = await response.json();
            
            // Replace only this specific assistant message with the new response
            // Read latest messages from ref to handle any concurrent updates
            const latestMessages = messagesRef.current;
            const messageStillExists = latestMessages.some(m => m.id === messageId);
            
            if (!messageStillExists) {
                // Message was deleted or changed, abort
                return;
            }

            const wasAborted = abortRequestedRef.current || data.aborted;
            
            if (data.success) {
                const text = formatAssistantContentForDisplay(data.content);
                const updated = latestMessages.map(m => {
                    if (m.id !== messageId) return m;
                    const next = {
                        ...m,
                        text,
                        timestamp: new Date().toISOString(),
                        metadata: data.metadata
                            ? { ...(m.metadata || {}), operation: data.metadata }
                            : m.metadata
                    };
                    const calls = toolCallFields(data.toolCalls);
                    if (calls.toolCalls) {
                        next.toolCalls = calls.toolCalls;
                        next.toolApproval = calls.toolApproval;
                    } else {
                        delete next.toolCalls;
                        delete next.toolApproval;
                    }
                    return next;
                });
                messagesRef.current = updated;
                setMessages([...updated]);
                if (data.metadata) {
                    setSelectedActivityMessageId(messageId);
                }
            } else {
                const meta = data.metadata ? { ...(latestMessages.find(m => m.id === messageId)?.metadata || {}), operation: data.metadata } : undefined;
                const updated = latestMessages.map(m =>
                    m.id === messageId
                        ? { ...m, text: formatChatFailureText(data, wasAborted), timestamp: new Date().toISOString(), metadata: meta }
                        : m
                );
                messagesRef.current = updated;
                setMessages([...updated]);
                if (data.metadata) {
                    setSelectedActivityMessageId(messageId);
                }
            }
        } catch (error) {
            reportApiFailure(error);
            const latestMessages = messagesRef.current;
            const updated = latestMessages.map(m => 
                m.id === messageId 
                    ? { ...m, text: formatChatFailureText(error, abortRequestedRef.current), timestamp: new Date().toISOString() }
                    : m
            );
            messagesRef.current = updated;
            setMessages([...updated]);
        } finally {
            abortRequestedRef.current = false;
            setIsResponding(false);
        }
    }, [isResponding, config, reportApiSuccess, reportApiFailure]);

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
        
        const updatedMessages = [...messages];
        setMessages(updatedMessages);
        messagesRef.current = updatedMessages;
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
        messagesRef.current = [];
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

    // Export active conversation as JSON or plain text (messages only, no config/metadata).
    const exportConversation = useCallback((format) => {
        saveConversation();
        const exportMessages = messagesForExport(messages, editingMessageId);
        if (exportMessages.length === 0) {
            return { ok: false, error: 'No messages to export' };
        }
        const promptName = prompts.find(p => p.id === currentPromptId)?.name;
        const payload = buildExportPayload({ promptName, messages: exportMessages });
        const isText = format === 'text';
        const content = isText ? serializeToText(payload) : serializeToJson(payload);
        const ext = isText ? 'txt' : 'json';
        const mimeType = isText ? 'text/plain;charset=utf-8' : 'application/json;charset=utf-8';
        downloadText(suggestedExportFilename(promptName, ext), content, mimeType);
        return { ok: true };
    }, [saveConversation, messages, prompts, currentPromptId, editingMessageId]);

    // Import conversation file into a new conversation on the current prompt.
    const importConversation = useCallback(async (file) => {
        if (isResponding) {
            return { ok: false, error: 'Wait for the current response to finish before importing.' };
        }
        if (!currentPromptId) {
            return { ok: false, error: 'Open a prompt before importing a conversation.' };
        }
        if (!file) {
            return { ok: false, error: 'No file selected.' };
        }
        try {
            saveConversation();
            const text = await file.text();
            const payload = parseImportFile(text, file.name);
            const importedMessages = sanitizeMessagesForImport(payload.messages);
            const convId = 'conv-' + generateId();
            const now = new Date().toISOString();
            Storage.set('conversations', [...Storage.get('conversations'), {
                id: convId,
                promptId: currentPromptId,
                messages: importedMessages,
                config: {},
                origin: { type: 'import' },
                createdAt: now,
                updatedAt: now
            }]);
            loadConversation(convId);
            return { ok: true };
        } catch (err) {
            return { ok: false, error: err.message || 'Failed to import conversation.' };
        }
    }, [isResponding, currentPromptId, saveConversation, loadConversation]);

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
            
            let updated;
            if (text.trim()) {
                if (hasSystem) {
                    updated = prev.map(m => m.role === 'system' ? { ...m, text } : m);
                } else {
                    updated = [{ id: 'system-' + Date.now(), text, role: 'system', timestamp: new Date().toISOString() }, ...prev];
                }
            } else {
                updated = prev.filter(m => m.role !== 'system');
            }
            messagesRef.current = updated;
            return updated;
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

    // Apply theme to document and persist
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch { /* ignore */ }
    }, [theme]);

    const setTheme = useCallback((next) => {
        setThemeState(prev => (next === 'dark' || next === 'light' ? next : prev === 'light' ? 'dark' : 'light'));
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                // Let the browser handle undo/redo while typing in a field
                const el = e.target;
                if (el instanceof HTMLTextAreaElement) return;
                if (el instanceof HTMLElement && el.isContentEditable) return;
                if (el instanceof HTMLInputElement) {
                    const type = (el.type || 'text').toLowerCase();
                    const nonText = ['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'hidden', 'image', 'range', 'color'];
                    if (!nonText.includes(type)) return;
                }
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
        messages, config, isResponding, settingsOpen, settingsDefaultSection, senderRole,
        editingMessageId, undoNotification, configSavedModels, configSavedResilience, configSavedTools, currentRoute,
        selectedActivityMessageId, isBackendPanelOpen,
        serverHealth,
        // Setters
        setConfig, setSettingsOpen, setSettingsDefaultSection, setSenderRole, setEditingMessageId, setCurrentRoute,
        setSelectedActivityMessageId, setIsBackendPanelOpen, theme, setTheme,
        // Actions
        createPrompt, openPrompt, deletePrompt, renamePrompt,
        sendMessage, abortRequest, addMessage, deleteMessage, editMessage, regenerateMessage,
        setWebSearchEnabled, setReadPageEnabled, decideToolCall,
        saveVersion, loadVersion, deleteVersion,
        newConversation, switchConversation, deleteConversation,
        branchAtMessage, setSystemPrompt, saveConversation, undo,
        exportConversation, importConversation,
        getVersions, getConversations, getBestVersion, toggleBestVersion, refreshPrompts, hideUndoNotification,
        refreshServerHealth, reportApiSuccess, reportApiFailure
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
