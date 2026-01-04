/**
 * Provider Registry - Centralized configuration and model management
 * Singleton pattern for global provider configuration
 * 
 * Handles provider configuration, API key management, and model fetching/caching
 */

/**
 * Unified Model Schema
 * @typedef {Object} UnifiedModel
 * @property {string} id - Model identifier (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')
 * @property {string} provider - Provider name ('openai', 'anthropic', 'google', 'ollama')
 * @property {string} name - Display name (if available from API)
 * @property {number} [contextWindow] - Maximum input tokens (if available from API, e.g., Gemini)
 * @property {any} raw - Full raw API response for this model
 */

class ProviderRegistry {
    static #initialized = false;
    static #providers = new Map();
    static #modelsCache = new Map(); // Map<providerName, Map<modelName, UnifiedModel>>
    // Use a temporary in-memory api key store for runtime provider configuration.
    // API keys are stored separately from config objects to prevent serialization.
    static #apiKeys = new Map(); // Map<providerName, apiKey>
    
    /**
     * Default provider configurations
     */
    static DEFAULT_PROVIDERS = {
        openai: {
            name: 'openai',
            displayName: 'OpenAI',
            chatApiUrl: 'https://api.openai.com/v1/chat/completions',
            modelsApiUrl: 'https://api.openai.com/v1/models',
            envVarNames: ['OPENAI_API_KEY'],
            defaultModel: 'gpt-4o-mini',
            apiVersion: null,
            iconUrl: null,
            customHeaders: {},
            authConfig: {
                type: 'header',
                headerName: 'Authorization',
                headerFormat: 'Bearer {key}'
            },
            parseConfig: {
                modelsPath: 'data',
                idField: 'id',
                nameField: 'id',
                displayNameField: null,
                contextWindowField: null,
                idPrefix: null
            },
            chatConfig: {
                messageFormat: 'openai', // 'openai' = keep system in messages, 'anthropic' = extract system
                responseParsePath: 'choices[0].message.content', // Path to extract content from response
                toolSchemaType: 'openai', // 'openai' = uses parameters, 'anthropic' = uses input_schema
            },
            active: true
        },
        anthropic: {
            name: 'anthropic',
            displayName: 'Anthropic',
            chatApiUrl: 'https://api.anthropic.com/v1/messages',
            modelsApiUrl: 'https://api.anthropic.com/v1/models',
            envVarNames: ['ANTHROPIC_API_KEY'],
            defaultModel: 'claude-3-5-sonnet-20240620',
            apiVersion: '2023-06-01',
            iconUrl: null,
            customHeaders: {
                'anthropic-version': '2023-06-01'
            },
            authConfig: {
                type: 'header',
                headerName: 'x-api-key',
                headerFormat: '{key}'
            },
            parseConfig: {
                modelsPath: 'data',
                idField: 'id',
                nameField: 'id',
                displayNameField: 'display_name',
                contextWindowField: null,
                idPrefix: null
            },
            chatConfig: {
                messageFormat: 'anthropic', // Extract system messages
                responseParsePath: 'content[0].text', // Anthropic response format
                toolSchemaType: 'anthropic', // Uses input_schema
            },
            active: true
        },
        google: {
            name: 'google',
            displayName: 'Google',
            chatApiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            modelsApiUrl: 'https://generativelanguage.googleapis.com/v1/models',
            envVarNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
            defaultModel: 'gemini-2.0-flash',
            apiVersion: null,
            iconUrl: null,
            customHeaders: {},
            authConfig: {
                type: 'query',
                queryParam: 'key'
            },
            parseConfig: {
                modelsPath: 'models',
                idField: 'name',
                nameField: 'name',
                displayNameField: 'displayName',
                contextWindowField: 'inputTokenLimit',
                idPrefix: 'models/'
            },
            chatConfig: {
                messageFormat: 'openai', // OpenAI-compatible
                responseParsePath: 'choices[0].message.content', // OpenAI-compatible response
                toolSchemaType: 'openai', // OpenAI-compatible
            },
            active: true
        },
        ollama: {
            name: 'ollama',
            displayName: 'Ollama',
            chatApiUrl: process.env?.OLLAMA_API_URL || 'http://localhost:11434/api/generate',
            modelsApiUrl: `${process.env?.OLLAMA_API_URL || 'http://localhost:11434'}/api/tags`,
            envVarNames: ['OLLAMA_API_KEY'],
            defaultModel: 'llama3.1:8b',
            apiVersion: null,
            iconUrl: null,
            customHeaders: {},
            authConfig: {
                type: 'header',
                headerName: 'Authorization',
                headerFormat: 'Bearer {key}',
                optional: true
            },
            parseConfig: {
                modelsPath: 'models',
                idField: 'name',
                nameField: 'name',
                displayNameField: null,
                contextWindowField: null,
                idPrefix: null
            },
            chatConfig: {
                messageFormat: 'openai', // Keep system in messages
                responseParsePath: 'response', // Ollama response format
                toolSchemaType: 'openai' // OpenAI-compatible
            },
            active: true
        }
    };
    
    /**
     * Normalize provider name to handle case-insensitive and space-insensitive matching
     * Converts to lowercase and removes all whitespace
     * 
     * @param {string} providerName - Provider identifier (may have mixed case/spaces)
     * @returns {string} Normalized provider name (lowercase, no spaces)
     * @private
     */
    static #normalizeProviderName(providerName) {
        if (!providerName || typeof providerName !== 'string') {
            return '';
        }
        return providerName.replace(/\s+/g, '').toLowerCase();
    }
    
    /**
     * Initialize registry with default providers
     * Auto-called on first use, but can be called explicitly
     */
    static init() {
        if (this.#initialized) {
            return;
        }
        
        for (const [name, config] of Object.entries(this.DEFAULT_PROVIDERS)) {
            this.#providers.set(name, { ...config });
        }
        
        this.#initialized = true;
    }
    
    /**
     * Configure or update a provider
     * Uses merge strategy: new config merges with existing
     * 
     * @param {string} providerName - Provider identifier
     * @param {Object} config - Provider configuration
     * @param {string} [config.chatApiUrl] - API URL for chat completion (required, unless baseUrl is provided)
     * @param {string} [config.modelsApiUrl] - API URL for model list (optional, auto-derived from baseUrl for Ollama)
     * @param {string} [config.baseUrl] - Base URL for the provider (e.g., 'http://localhost:11434' for Ollama). For Ollama, auto-generates chatApiUrl and modelsApiUrl. For others, used as chatApiUrl if OpenAI-compatible.
     * @param {string[]} [config.envVarNames] - Environment variable names to check for API key (optional)
     * @param {string} [config.apiKey] - Direct API key (optional, highest priority, stored securely)
     * @param {string} [config.defaultModel] - Default model identifier
     * @param {string} [config.apiVersion] - API version header (can also be in customHeaders)
     * @param {string} [config.displayName] - Human-readable name
     * @param {string} [config.iconUrl] - Icon URL for UI
     * @param {Object} [config.customHeaders] - Custom HTTP headers
     * @param {Object} [config.authConfig] - Authentication configuration
     * @param {string} [config.authConfig.type] - Auth type: 'header' (default) or 'query'
     * @param {string} [config.authConfig.headerName] - Header name for auth (default: 'Authorization')
     * @param {string} [config.authConfig.headerFormat] - Header format template with {key} placeholder (default: 'Bearer {key}')
     * @param {string} [config.authConfig.queryParam] - Query parameter name for auth (required if type is 'query')
     * @param {boolean} [config.authConfig.optional] - Whether API key is optional (default: false)
     * @param {Object} [config.parseConfig] - Model response parsing configuration
     * @param {string} [config.parseConfig.modelsPath] - Path to models array in response (e.g., 'data', 'models', 'items')
     * @param {string} [config.parseConfig.idField] - Field name for model ID (default: 'id' or 'name')
     * @param {string} [config.parseConfig.nameField] - Field name for model name (default: same as idField)
     * @param {string} [config.parseConfig.displayNameField] - Field name for display name (optional)
     * @param {string} [config.parseConfig.contextWindowField] - Field name for context window (optional)
     * @param {string} [config.parseConfig.idPrefix] - Prefix to strip from model ID (e.g., 'models/' for Google)
     * @param {Object} [config.chatConfig] - Chat API configuration
     * @param {string} [config.chatConfig.messageFormat] - Message format: 'openai' (keep system in messages) or 'anthropic' (extract system)
     * @param {string} [config.chatConfig.responseParsePath] - Path to extract content from response (e.g., 'choices[0].message.content', 'content[0].text', 'response')
     * @param {string} [config.chatConfig.toolSchemaType] - Tool schema type: 'openai' (uses parameters) or 'anthropic' (uses input_schema)
     * @param {boolean} [config.active] - Whether provider is active (default: true)
     */
    static configure(providerName, config) {
        this.init(); // Ensure initialized

        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        const existing = this.#providers.get(providerName) || {};
        
        // Handle baseUrl convenience parameter - derive URLs from base URL
        let chatApiUrl = config.chatApiUrl || existing.chatApiUrl;
        let modelsApiUrl = config.modelsApiUrl || existing.modelsApiUrl;
        
        if (config.baseUrl) {
            const baseUrl = config.baseUrl.replace(/\/$/, '');

            if (providerName === 'ollama') {
                if (!existing.chatApiUrl && !config.chatApiUrl)
                    chatApiUrl = `${baseUrl}/api/generate`;
                if (!existing.modelsApiUrl && !config.modelsApiUrl)
                    modelsApiUrl = `${baseUrl}/api/tags`;
            } else {
                if (!existing.chatApiUrl && !config.chatApiUrl)
                    chatApiUrl = `${baseUrl}/v1/chat/completions`;
                if (!existing.modelsApiUrl && !config.modelsApiUrl)
                    modelsApiUrl = `${baseUrl}/v1/models`;
            }
        }
        
        if (!chatApiUrl && !existing.chatApiUrl) {
            console.warn(`Please set the chatApiUrl (or baseUrl) for provider "${providerName}". This provider won't work without it.`);
        }

        // Store API key securely if provided
        let apiKeyToStore = null;
        if (config.apiKey !== undefined) {
            apiKeyToStore = config.apiKey;
            // Don't store in config object to prevent serialization
            delete config.apiKey;
        }
        
        // Merge strategy: shallow merge, arrays replace, deep merge for objects
        const merged = {
            name: providerName,
            displayName: config.displayName || existing.displayName || providerName,
            chatApiUrl: chatApiUrl,
            modelsApiUrl: modelsApiUrl,
            envVarNames: config.envVarNames || existing.envVarNames || [],
            defaultModel: config.defaultModel || existing.defaultModel,
            apiVersion: config.apiVersion !== undefined ? config.apiVersion : existing.apiVersion,
            iconUrl: config.iconUrl || existing.iconUrl,
            customHeaders: { ...existing.customHeaders, ...(config.customHeaders || {}) },
            authConfig: config.authConfig ? { ...(existing.authConfig || {}), ...config.authConfig } : (existing.authConfig || {
                type: 'header',
                headerName: 'Authorization',
                headerFormat: 'Bearer {key}'
            }),
            parseConfig: config.parseConfig ? { ...(existing.parseConfig || {}), ...config.parseConfig } : (existing.parseConfig || {
                modelsPath: 'data',
                idField: 'id',
                nameField: 'id',
                displayNameField: null,
                contextWindowField: null,
                idPrefix: null
            }),
            chatConfig: config.chatConfig ? { ...(existing.chatConfig || {}), ...config.chatConfig } : (existing.chatConfig || {
                messageFormat: 'openai',
                responseParsePath: 'choices[0].message.content',
                toolSchemaType: 'openai',
            }),
            active: config.active !== undefined ? config.active : (existing.active !== undefined ? existing.active : true)
        };
        
        this.#providers.set(providerName, merged);
        
        // Store API key securely using Map with provider name as key
        if (apiKeyToStore) {
            this.#apiKeys.set(providerName, apiKeyToStore);
        }
        
        // Invalidate model cache for this provider
        this.#modelsCache.delete(providerName);
        
        return { ...merged }; // Return copy without API key
    }
    
    /**
     * Get provider configuration (without API key)
     * 
     * @param {string} providerName - Provider identifier
     * @returns {Object|null} Provider configuration or null if not found
     */
    static get(providerName) {
        this.init();
        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.#providers.get(providerName);
        return provider ? { ...provider } : null; // Return copy to prevent mutation
    }
    
    /**
     * List all configured providers
     * 
     * @param {Object} [options] - Filter options
     * @param {boolean} [options.active] - Filter by active status
     * @returns {Array<Object>} Array of provider configurations (without API keys)
     */
    static list(options = {}) {
        this.init();
        
        let providers = Array.from(this.#providers.values());
        
        if (options.active !== undefined) {
            providers = providers.filter(p => p.active === options.active);
        }
        
        return providers.map(p => ({ ...p })); // Return copies without API keys
    }
    
    /**
     * Get API key for a provider (internal use only)
     * Priority: direct apiKey > env vars (in order) > null
     * 
     * @param {string} providerName - Provider identifier
     * @returns {string|null} API key or null if not found
     * @private
     */
    static #getApiKey(providerName) {
        this.init();
        // Normalize provider name (get() will also normalize, but be explicit)
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        
        if (!provider) {
            return null;
        }
        
        // Priority 1: Direct apiKey from Map (highest priority)
        const storedKey = this.#apiKeys.get(providerName);
        if (storedKey) {
            return storedKey;
        }
        
        // Priority 2: Environment variables (in order)
        if (provider.envVarNames && provider.envVarNames.length > 0) {
            if (typeof process !== 'undefined' && process.env) {
                for (const envVarName of provider.envVarNames) {
                    if (process.env[envVarName]) {
                        return process.env[envVarName];
                    }
                }
            }
        }
        
        // If auth is optional, return null without warning
        const authConfig = provider.authConfig || {};
        if (authConfig.optional) {
            return null;
        }
        
        return null;
    }
    
    /**
     * Get chat API URL for a provider
     * 
     * @param {string} providerName - Provider identifier
     * @returns {string|null} API URL or null if not found
     */
    static getChatApiUrl(providerName) {
        this.init();
        // Normalize provider name (get() will also normalize, but be explicit)
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        return provider ? provider.chatApiUrl : null;
    }
    
    /**
     * Get custom headers for a provider (merged with library defaults)
     * 
     * @param {string} providerName - Provider identifier
     * @param {Object} [defaultHeaders] - Default headers from library
     * @returns {Object} Merged headers
     */
    static getHeaders(providerName, defaultHeaders = {}) {
        this.init();
        // Normalize provider name (get() will also normalize, but be explicit)
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        
        if (!provider) {
            return defaultHeaders;
        }
        
        // Merge: custom headers override defaults
        return { ...defaultHeaders, ...provider.customHeaders };
    }
    
    /**
     * Get chat configuration for a provider
     * 
     * @param {string} providerName - Provider identifier
     * @returns {Object|null} Chat configuration or null if not found
     */
    static getChatConfig(providerName) {
        this.init();
        // Normalize provider name (get() will also normalize, but be explicit)
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        return provider?.chatConfig || null;
    }
    
    /**
     * Check if an API key is available for a provider (without exposing the key)
     * 
     * @param {string} providerName - Provider identifier
     * @returns {boolean} True if API key is available
     */
    static hasApiKey(providerName) {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        return this.#getApiKey(providerName) !== null;
    }
    
    /**
     * Build authentication headers for a provider
     * If apiKey is not provided, it will be retrieved automatically from stored keys or environment variables
     * 
     * @param {string} providerName - Provider identifier
     * @param {string} [apiKey] - Optional API key (if not provided, will be retrieved automatically)
     * @param {Object} [defaultHeaders] - Default headers
     * @returns {Object} Headers with authentication
     */
    static buildAuthHeaders(providerName, apiKey = null, defaultHeaders = {}) {
        this.init();
        // Normalize provider name (get() will also normalize, but be explicit)
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        
        if (!provider) {
            return defaultHeaders;
        }
        
        // If API key not provided, retrieve it automatically
        if (!apiKey) {
            apiKey = this.#getApiKey(providerName);
        }
        
        const authConfig = provider.authConfig || {
            type: 'header',
            headerName: 'Authorization',
            headerFormat: 'Bearer {key}'
        };
        
        const headers = { ...defaultHeaders };
        
        if (apiKey && authConfig.type === 'header') {
            const headerName = authConfig.headerName || 'Authorization';
            const headerFormat = authConfig.headerFormat || 'Bearer {key}';
            const headerValue = headerFormat.replace('{key}', apiKey);
            headers[headerName] = headerValue;
        }
        
        // Merge custom headers (these can override auth headers if needed)
        return { ...headers, ...provider.customHeaders };
    }
    
    /**
     * Build API URL with query parameter authentication if needed
     * 
     * @param {string} providerName - Provider identifier
     * @param {string} apiUrl - Base API URL
     * @returns {string} API URL with query parameters if needed
     */
    static buildApiUrl(providerName, apiUrl) {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        
        if (!provider) {
            return apiUrl;
        }
        
        const authConfig = provider.authConfig || {};
        
        // Only handle query parameter auth here (header auth is handled in buildAuthHeaders)
        if (authConfig.type === 'query') {
            const apiKey = this.#getApiKey(providerName);
            if (apiKey) {
                const separator = apiUrl.includes('?') ? '&' : '?';
                const paramName = authConfig.queryParam || 'key';
                return `${apiUrl}${separator}${paramName}=${encodeURIComponent(apiKey)}`;
            }
        }
        
        return apiUrl;
    }
    
    /**
     * Get all models for a provider or all providers
     * Uses cache-first strategy
     * 
     * @param {string} [providerName] - Optional provider name, if not provided returns all
     * @param {string} [apiKey] - Optional API key override
     * @returns {Promise<UnifiedModel[]>} Array of unified models
     */
    static async getModels(providerName = null, apiKey = null) {
        this.init();
        
        if (providerName) {
            // Normalize provider name for consistent lookup
            providerName = this.#normalizeProviderName(providerName);
            // Check cache first
            const cached = this.#modelsCache.get(providerName);
            if (cached && cached.size > 0) {
                return Array.from(cached.values());
            }
            
            // Fetch from API
            const provider = this.get(providerName);
            if (!provider) {
                return [];
            }
            
            // If no modelsApiUrl, return empty array
            if (!provider.modelsApiUrl) {
                return [];
            }
            
            try {
                const keyToUse = apiKey || this.#getApiKey(providerName);
                const authConfig = provider.authConfig || {};
                if (!keyToUse && !authConfig.optional) {
                    console.warn(`API key not available for ${providerName}. Neither provided nor available in environment variables.`);
                }
                
                const models = await this.#fetchModels(providerName, provider, keyToUse);
                
                // Cache models
                const modelMap = new Map();
                models.forEach(model => {
                    modelMap.set(model.id, model);
                });
                this.#modelsCache.set(providerName, modelMap);
                
                return models;
            } catch (error) {
                console.error(`Error fetching models for ${providerName}:`, error);
                return [];
            }
        } else {
            // Return all cached models
            const allModels = [];
            for (const [name, modelMap] of this.#modelsCache.entries()) {
                allModels.push(...Array.from(modelMap.values()));
            }
            return allModels;
        }
    }
    
    /**
     * Get specific model details
     * 
     * @param {string} providerName - Provider identifier
     * @param {string} modelName - Model identifier
     * @param {string} [apiKey] - Optional API key override
     * @param {Object} [options] - Additional options
     * @returns {Promise<UnifiedModel|null>} Model object or null if not found
     */
    static async getModel(providerName, modelName, apiKey = null) {
        this.init();
        
        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        // Check cache first
        const cached = this.#modelsCache.get(providerName);
        if (cached && cached.has(modelName)) {
            return cached.get(modelName);
        }
        
        // Fetch all models for provider
        const models = await this.getModels(providerName, apiKey);
        return models.find(m => m.id === modelName) || null;
    }
    
    /**
     * Save or update a model in cache
     * 
     * @param {string} providerName - Provider identifier
     * @param {string} modelName - Model identifier
     * @param {Object} modelData - Model data
     */
    static saveModel(providerName, modelName, modelData) {
        this.init();
        
        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        if (!this.#modelsCache.has(providerName)) {
            this.#modelsCache.set(providerName, new Map());
        }
        
        const modelMap = this.#modelsCache.get(providerName);
        modelMap.set(modelName, { 
            ...modelData, 
            id: modelName, 
            provider: providerName 
        });
    }
    
    /**
     * Internal method to fetch models from API
     * Includes provider-specific parsing logic
     */
    static async #fetchModels(providerName, provider, apiKey) {
        let url = provider.modelsApiUrl;
        const defaultHeaders = { 'Content-Type': 'application/json' };
        
        // No runtime URL override - URLs should be configured via ProviderRegistry.configure()
        
        // Generic authentication handling using authConfig
        const authConfig = provider.authConfig || {
            type: 'header',
            headerName: 'Authorization',
            headerFormat: 'Bearer {key}'
        };
        
        if (apiKey && authConfig.type === 'query') {
            // Add API key as query parameter
            const separator = url.includes('?') ? '&' : '?';
            const paramName = authConfig.queryParam || 'key';
            url = `${url}${separator}${paramName}=${encodeURIComponent(apiKey)}`;
        }
        
        // Build headers using shared auth header building logic
        // This handles header-based auth and custom headers
        let headers = this.buildAuthHeaders(providerName, apiKey, defaultHeaders);
        
        // Handle apiVersion for backward compatibility (if not already in customHeaders)
        if (provider.apiVersion && providerName === 'anthropic' && !headers['anthropic-version']) {
            headers['anthropic-version'] = provider.apiVersion;
        }
        
        const response = await fetch(url, {
            method: 'GET',
            headers
        });
        
        if (!response.ok) {
            throw new Error(`${providerName} API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Provider-specific parsing
        return this.#parseModels(providerName, data);
    }
    
    /**
     * Parse provider API responses into unified schema
     * Generic parser that works with any provider response format using parseConfig
     * 
     * @param {string} providerName - Provider identifier
     * @param {Object} data - Raw API response
     * @returns {UnifiedModel[]} Array of unified models
     */
    static #parseModels(providerName, data) {
        const provider = this.get(providerName);
        const parseConfig = provider?.parseConfig || {
            modelsPath: 'data',
            idField: 'id',
            nameField: 'id',
            displayNameField: null,
            contextWindowField: null,
            idPrefix: null
        };
        
        // Extract models array from response using configured path
        // Try multiple common paths if configured path doesn't exist
        let models = [];
        if (parseConfig.modelsPath) {
            // Use configured path (supports nested paths like 'response.data')
            const pathParts = parseConfig.modelsPath.split('.');
            let current = data;
            for (const part of pathParts) {
                if (current && typeof current === 'object' && part in current) {
                    current = current[part];
                } else {
                    current = null;
                    break;
                }
            }
            if (Array.isArray(current)) {
                models = current;
            }
        }
        
        // Fallback: try common patterns if configured path didn't work
        if (models.length === 0) {
            models = data.data || data.models || data.items || data.results || [];
        }
        
        // Ensure models is an array
        if (!Array.isArray(models)) {
            console.warn(`Unexpected response format for ${providerName}. Expected array of models.`);
            return [];
        }
        
        // Map models to unified schema
        return models.map(model => {
            if (!model || typeof model !== 'object') {
                return null;
            }
            
            // Extract ID field
            let id = this.#getNestedValue(model, parseConfig.idField) || 
                     model.id || 
                     model.name || 
                     model.model_id ||
                     model.model;
            
            // Strip prefix if configured (e.g., "models/gpt-4" -> "gpt-4")
            if (parseConfig.idPrefix && id && id.startsWith(parseConfig.idPrefix)) {
                id = id.substring(parseConfig.idPrefix.length);
            }
            
            // Extract name field
            const nameField = parseConfig.nameField || parseConfig.idField || 'id';
            let name = this.#getNestedValue(model, nameField) || 
                      model.name || 
                      model.display_name ||
                      model.displayName ||
                      id;
            
            // Extract display name if configured
            let displayName = null;
            if (parseConfig.displayNameField) {
                displayName = this.#getNestedValue(model, parseConfig.displayNameField) ||
                             model.display_name ||
                             model.displayName;
            }
            
            // Extract context window if configured
            let contextWindow = null;
            if (parseConfig.contextWindowField) {
                contextWindow = this.#getNestedValue(model, parseConfig.contextWindowField) ||
                              model.inputTokenLimit ||
                              model.contextWindow ||
                              model.max_tokens ||
                              model.context_window;
            } else {
                // Try common field names as fallback
                contextWindow = model.inputTokenLimit ||
                               model.contextWindow ||
                               model.max_tokens ||
                               model.context_window ||
                               null;
            }
            
            return {
                id: id || 'unknown',
                provider: providerName,
                name: displayName || name || id,
                contextWindow: contextWindow || undefined,
                raw: model
            };
        }).filter(model => model !== null); // Remove any null entries
    }
    
    /**
     * Helper to get nested value from object using dot notation path
     * @private
     */
    static #getNestedValue(obj, path) {
        if (!path || !obj) return null;
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return null;
            }
        }
        return current;
    }
    
    /**
     * Clear cache for a provider or all providers
     * 
     * @param {string} [providerName] - Optional provider name
     */
    static clearCache(providerName = null) {
        if (providerName) {
            // Normalize provider name for consistent lookup
            providerName = this.#normalizeProviderName(providerName);
            this.#modelsCache.delete(providerName);
        } else {
            this.#modelsCache.clear();
        }
    }
    
    /**
     * Check if models are cached for a provider
     * 
     * @param {string} providerName - Provider identifier
     * @returns {boolean} True if models are cached
     */
    static isCached(providerName) {
        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        return this.#modelsCache.has(providerName) && this.#modelsCache.get(providerName).size > 0;
    }
    
    /**
     * Get cache timestamp for a provider (using first model's timestamp if available)
     * 
     * @param {string} providerName - Provider identifier
     * @returns {number|null} Timestamp when data was cached, or null if not cached
     */
    static getCacheTimestamp(providerName) {
        // Normalize provider name for consistent lookup
        providerName = this.#normalizeProviderName(providerName);
        const cached = this.#modelsCache.get(providerName);
        if (cached && cached.size > 0) {
            // Return current time as approximation (we don't store timestamp per model)
            return Date.now();
        }
        return null;
    }
    
    /**
     * Get default models for all providers
     * Returns an object mapping provider names to their default model identifiers
     * 
     * @returns {Object<string, string>} Object with provider names as keys and default model IDs as values
     */
    static getDefaultModels() {
        this.init();
        const providers = this.list();
        const models = {};
        providers.forEach(provider => {
            if (provider.defaultModel) {
                models[provider.name] = provider.defaultModel;
            }
        });
        return models;
    }
    
    /**
     * Reset registry to defaults (useful for testing)
     */
    static reset() {
        this.#providers.clear();
        this.#modelsCache.clear();
        this.#apiKeys.clear();
        this.#initialized = false;
        this.init();
    }
}

export default ProviderRegistry;

