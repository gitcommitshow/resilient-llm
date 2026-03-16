export interface AuthConfig {
    type: 'header' | 'query';
    headerName?: string;
    headerFormat?: string;
    queryParam?: string;
    optional?: boolean;
}

export interface ParseConfig {
    modelsPath: string;
    idField: string;
    nameField: string;
    displayNameField: string | null;
    contextWindowField: string | null;
    idPrefix: string | null;
}

export interface ChatConfig {
    messageFormat: 'openai' | 'anthropic';
    responseParsePath: string;
    toolSchemaType: 'openai' | 'anthropic';
}

export interface ProviderConfig {
    name: string;
    displayName: string;
    chatApiUrl: string;
    modelsApiUrl?: string;
    docsUrl?: string;
    envVarNames: string[];
    defaultModel: string;
    apiVersion: string | null;
    iconUrl: string | null;
    customHeaders: Record<string, string>;
    authConfig: AuthConfig;
    endpointAuthConfigs?: Record<string, AuthConfig>;
    parseConfig: ParseConfig;
    chatConfig: ChatConfig;
    active: boolean;
}

export interface ConfigureInput {
    chatApiUrl?: string;
    modelsApiUrl?: string;
    baseUrl?: string;
    envVarNames?: string[];
    apiKey?: string;
    defaultModel?: string;
    apiVersion?: string;
    displayName?: string;
    iconUrl?: string;
    customHeaders?: Record<string, string>;
    authConfig?: Partial<AuthConfig>;
    parseConfig?: Partial<ParseConfig>;
    chatConfig?: Partial<ChatConfig>;
    active?: boolean;
}

export interface UnifiedModel {
    id: string;
    provider: string;
    name: string;
    contextWindow?: number;
    raw: unknown;
}

export interface ListOptions {
    active?: boolean;
}

class ProviderRegistry {
    static #initialized = false;
    static #providers = new Map<string, ProviderConfig>();
    static #modelsCache = new Map<string, Map<string, UnifiedModel>>();
    static #apiKeys = new Map<string, string>();

    static DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
        openai: {
            name: 'openai',
            displayName: 'OpenAI',
            chatApiUrl: 'https://api.openai.com/v1/chat/completions',
            modelsApiUrl: 'https://api.openai.com/v1/models',
            docsUrl: "https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create",
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
                messageFormat: 'openai',
                responseParsePath: 'choices[0].message.content',
                toolSchemaType: 'openai',
            },
            active: true
        },
        anthropic: {
            name: 'anthropic',
            displayName: 'Anthropic',
            chatApiUrl: 'https://api.anthropic.com/v1/messages',
            modelsApiUrl: 'https://api.anthropic.com/v1/models',
            docsUrl: "https://platform.claude.com/docs/en/api/messages/create",
            envVarNames: ['ANTHROPIC_API_KEY'],
            defaultModel: 'claude-haiku-4-5-20251001',
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
                messageFormat: 'anthropic',
                responseParsePath: 'content[0].text',
                toolSchemaType: 'anthropic',
            },
            active: true
        },
        google: {
            name: 'google',
            displayName: 'Google',
            chatApiUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
            modelsApiUrl: 'https://generativelanguage.googleapis.com/v1/models',
            docsUrl: "https://ai.google.dev/api",
            envVarNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
            defaultModel: 'gemini-2.0-flash',
            apiVersion: null,
            iconUrl: null,
            customHeaders: {},
            authConfig: {
                type: 'query',
                queryParam: 'key'
            },
            endpointAuthConfigs: {
                '/chat/completions': {
                    type: 'header',
                    headerName: 'Authorization',
                    headerFormat: 'Bearer {key}'
                },
                '/models': {
                    type: 'query',
                    queryParam: 'key'
                }
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
                messageFormat: 'openai',
                responseParsePath: 'choices[0].message.content',
                toolSchemaType: 'openai',
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
                messageFormat: 'openai',
                responseParsePath: 'response',
                toolSchemaType: 'openai'
            },
            active: true
        }
    };

    static #normalizeProviderName(providerName: string): string {
        if (!providerName || typeof providerName !== 'string') {
            return '';
        }
        return providerName.replace(/\s+/g, '').toLowerCase();
    }

    static init(): void {
        if (this.#initialized) {
            return;
        }

        for (const [name, config] of Object.entries(this.DEFAULT_PROVIDERS)) {
            this.#providers.set(name, { ...config });
        }

        this.#initialized = true;
    }

    static configure(providerName: string, config: ConfigureInput): ProviderConfig {
        this.init();

        providerName = this.#normalizeProviderName(providerName);
        const existing = this.#providers.get(providerName) || {} as Partial<ProviderConfig>;

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

        let apiKeyToStore: string | null = null;
        if (config.apiKey !== undefined) {
            apiKeyToStore = config.apiKey;
            delete config.apiKey;
        }

        const merged: ProviderConfig = {
            name: providerName,
            displayName: config.displayName || existing.displayName || providerName,
            chatApiUrl: chatApiUrl || '',
            modelsApiUrl: modelsApiUrl,
            envVarNames: config.envVarNames || existing.envVarNames || [],
            defaultModel: config.defaultModel || existing.defaultModel || '',
            apiVersion: config.apiVersion !== undefined ? config.apiVersion : (existing.apiVersion ?? null),
            iconUrl: config.iconUrl || existing.iconUrl || null,
            customHeaders: { ...(existing.customHeaders || {}), ...(config.customHeaders || {}) },
            authConfig: config.authConfig
                ? { ...(existing.authConfig || {} as AuthConfig), ...config.authConfig } as AuthConfig
                : (existing.authConfig || {
                    type: 'header',
                    headerName: 'Authorization',
                    headerFormat: 'Bearer {key}'
                } as AuthConfig),
            parseConfig: config.parseConfig
                ? { ...(existing.parseConfig || {} as ParseConfig), ...config.parseConfig } as ParseConfig
                : (existing.parseConfig || {
                    modelsPath: 'data',
                    idField: 'id',
                    nameField: 'id',
                    displayNameField: null,
                    contextWindowField: null,
                    idPrefix: null
                } as ParseConfig),
            chatConfig: config.chatConfig
                ? { ...(existing.chatConfig || {} as ChatConfig), ...config.chatConfig } as ChatConfig
                : (existing.chatConfig || {
                    messageFormat: 'openai',
                    responseParsePath: 'choices[0].message.content',
                    toolSchemaType: 'openai',
                } as ChatConfig),
            active: config.active !== undefined ? config.active : (existing.active !== undefined ? existing.active : true)
        };

        this.#providers.set(providerName, merged);

        if (apiKeyToStore) {
            this.#apiKeys.set(providerName, apiKeyToStore);
        }

        this.#modelsCache.delete(providerName);

        return { ...merged };
    }

    static get(providerName: string): ProviderConfig | null {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.#providers.get(providerName);
        return provider ? { ...provider } : null;
    }

    static list(options: ListOptions = {}): ProviderConfig[] {
        this.init();

        let providers = Array.from(this.#providers.values());

        if (options.active !== undefined) {
            providers = providers.filter(p => p.active === options.active);
        }

        return providers.map(p => ({ ...p }));
    }

    static #getApiKey(providerName: string): string | null {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);

        if (!provider) {
            return null;
        }

        const storedKey = this.#apiKeys.get(providerName);
        if (storedKey) {
            return storedKey;
        }

        if (provider.envVarNames && provider.envVarNames.length > 0) {
            if (typeof process !== 'undefined' && process.env) {
                for (const envVarName of provider.envVarNames) {
                    if (process.env[envVarName]) {
                        return process.env[envVarName]!;
                    }
                }
            }
        }

        const authConfig = provider.authConfig || {} as AuthConfig;
        if (authConfig.optional) {
            return null;
        }

        return null;
    }

    static getChatApiUrl(providerName: string): string | null {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        return provider ? provider.chatApiUrl : null;
    }

    static getHeaders(providerName: string, defaultHeaders: Record<string, string> = {}): Record<string, string> {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);

        if (!provider) {
            return defaultHeaders;
        }

        return { ...defaultHeaders, ...provider.customHeaders };
    }

    static getChatConfig(providerName: string): ChatConfig | null {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);
        return provider?.chatConfig || null;
    }

    static hasApiKey(providerName: string): boolean {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        return this.#getApiKey(providerName) !== null;
    }

    static buildAuthHeaders(
        providerName: string,
        apiKey: string | null = null,
        defaultHeaders: Record<string, string> = {},
        apiUrl: string | null = null
    ): Record<string, string> {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);

        if (!provider) {
            return defaultHeaders;
        }

        if (!apiKey) {
            apiKey = this.#getApiKey(providerName);
        }

        let authConfig: AuthConfig = provider.authConfig || {
            type: 'header',
            headerName: 'Authorization',
            headerFormat: 'Bearer {key}'
        };

        if (apiUrl && provider.endpointAuthConfigs) {
            const matchingPattern = Object.keys(provider.endpointAuthConfigs)
                .filter(pattern => apiUrl.includes(pattern))
                .sort((a, b) => b.length - a.length)[0];

            if (matchingPattern) {
                authConfig = provider.endpointAuthConfigs[matchingPattern];
            }
        }

        const headers: Record<string, string> = { ...defaultHeaders };

        if (apiKey && authConfig.type === 'header') {
            const headerName = authConfig.headerName || 'Authorization';
            const headerFormat = authConfig.headerFormat || 'Bearer {key}';
            const headerValue = headerFormat.replace('{key}', apiKey);
            headers[headerName] = headerValue;
        }

        return { ...headers, ...provider.customHeaders };
    }

    static buildApiUrl(providerName: string, apiUrl: string, apiKey: string | null = null): string {
        this.init();
        providerName = this.#normalizeProviderName(providerName);
        const provider = this.get(providerName);

        if (!provider) {
            return apiUrl;
        }

        let authConfig: AuthConfig = provider.authConfig || {} as AuthConfig;

        if (provider.endpointAuthConfigs) {
            const matchingPattern = Object.keys(provider.endpointAuthConfigs)
                .filter(pattern => apiUrl.includes(pattern))
                .sort((a, b) => b.length - a.length)[0];

            if (matchingPattern) {
                authConfig = provider.endpointAuthConfigs[matchingPattern];
            }
        }

        if (authConfig.type === 'query') {
            if (!apiKey) {
                apiKey = this.#getApiKey(providerName);
            }
            if (apiKey) {
                const separator = apiUrl.includes('?') ? '&' : '?';
                const paramName = authConfig.queryParam || 'key';
                return `${apiUrl}${separator}${paramName}=${encodeURIComponent(apiKey)}`;
            }
        }

        return apiUrl;
    }

    static async getModels(providerName: string | null = null, apiKey: string | null = null): Promise<UnifiedModel[]> {
        this.init();

        if (providerName) {
            providerName = this.#normalizeProviderName(providerName);
            const cached = this.#modelsCache.get(providerName);
            if (cached && cached.size > 0) {
                return Array.from(cached.values());
            }

            const provider = this.get(providerName);
            if (!provider) {
                return [];
            }

            if (!provider.modelsApiUrl) {
                return [];
            }

            try {
                const keyToUse = apiKey || this.#getApiKey(providerName);
                const authConfig = provider.authConfig || {} as AuthConfig;
                if (!keyToUse && !authConfig.optional) {
                    console.warn(`API key not available for ${providerName}. Neither provided nor available in environment variables.`);
                }

                const models = await this.#fetchModels(providerName, provider, keyToUse);

                const modelMap = new Map<string, UnifiedModel>();
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
            const allModels: UnifiedModel[] = [];
            for (const [, modelMap] of this.#modelsCache.entries()) {
                allModels.push(...Array.from(modelMap.values()));
            }
            return allModels;
        }
    }

    static async getModel(providerName: string, modelName: string, apiKey: string | null = null): Promise<UnifiedModel | null> {
        this.init();

        providerName = this.#normalizeProviderName(providerName);
        const cached = this.#modelsCache.get(providerName);
        if (cached && cached.has(modelName)) {
            return cached.get(modelName)!;
        }

        const models = await this.getModels(providerName, apiKey);
        return models.find(m => m.id === modelName) || null;
    }

    static saveModel(providerName: string, modelName: string, modelData: Partial<UnifiedModel>): void {
        this.init();

        providerName = this.#normalizeProviderName(providerName);
        if (!this.#modelsCache.has(providerName)) {
            this.#modelsCache.set(providerName, new Map());
        }

        const modelMap = this.#modelsCache.get(providerName)!;
        modelMap.set(modelName, {
            ...modelData,
            id: modelName,
            provider: providerName
        } as UnifiedModel);
    }

    static async #fetchModels(providerName: string, provider: ProviderConfig, apiKey: string | null): Promise<UnifiedModel[]> {
        let url = provider.modelsApiUrl;
        const defaultHeaders: Record<string, string> = { 'Content-Type': 'application/json' };

        if (!url) return [];

        url = this.buildApiUrl(providerName, url, apiKey);

        let headers = this.buildAuthHeaders(providerName, apiKey, defaultHeaders, url);

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

        return this.#parseModels(providerName, data);
    }

    static #parseModels(providerName: string, data: Record<string, unknown>): UnifiedModel[] {
        const provider = this.get(providerName);
        const parseConfig: ParseConfig = provider?.parseConfig || {
            modelsPath: 'data',
            idField: 'id',
            nameField: 'id',
            displayNameField: null,
            contextWindowField: null,
            idPrefix: null
        };

        let models: unknown[] = [];
        if (parseConfig.modelsPath) {
            const pathParts = parseConfig.modelsPath.split('.');
            let current: unknown = data;
            for (const part of pathParts) {
                if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
                    current = (current as Record<string, unknown>)[part];
                } else {
                    current = null;
                    break;
                }
            }
            if (Array.isArray(current)) {
                models = current;
            }
        }

        if (models.length === 0) {
            const d = data as Record<string, unknown>;
            models = (d.data || d.models || d.items || d.results || []) as unknown[];
        }

        if (!Array.isArray(models)) {
            console.warn(`Unexpected response format for ${providerName}. Expected array of models.`);
            return [];
        }

        return models.map(model => {
            if (!model || typeof model !== 'object') {
                return null;
            }
            const m = model as Record<string, unknown>;

            let id = (this.#getNestedValue(m, parseConfig.idField) ||
                     m.id ||
                     m.name ||
                     m.model_id ||
                     m.model) as string | undefined;

            if (parseConfig.idPrefix && id && id.startsWith(parseConfig.idPrefix)) {
                id = id.substring(parseConfig.idPrefix.length);
            }

            const nameField = parseConfig.nameField || parseConfig.idField || 'id';
            const name = (this.#getNestedValue(m, nameField) ||
                      m.name ||
                      m.display_name ||
                      m.displayName ||
                      id) as string | undefined;

            let displayName: string | null = null;
            if (parseConfig.displayNameField) {
                displayName = (this.#getNestedValue(m, parseConfig.displayNameField) ||
                             m.display_name ||
                             m.displayName) as string | null;
            }

            let contextWindow: number | undefined;
            if (parseConfig.contextWindowField) {
                contextWindow = (this.#getNestedValue(m, parseConfig.contextWindowField) ||
                              m.inputTokenLimit ||
                              m.contextWindow ||
                              m.max_tokens ||
                              m.context_window) as number | undefined;
            } else {
                contextWindow = (m.inputTokenLimit ||
                               m.contextWindow ||
                               m.max_tokens ||
                               m.context_window ||
                               undefined) as number | undefined;
            }

            return {
                id: id || 'unknown',
                provider: providerName,
                name: displayName || name || id || 'unknown',
                contextWindow: contextWindow || undefined,
                raw: model
            } as UnifiedModel;
        }).filter((model): model is UnifiedModel => model !== null);
    }

    static #getNestedValue(obj: Record<string, unknown>, path: string): unknown {
        if (!path || !obj) return null;
        const parts = path.split('.');
        let current: unknown = obj;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
                current = (current as Record<string, unknown>)[part];
            } else {
                return null;
            }
        }
        return current;
    }

    static clearCache(providerName: string | null = null): void {
        if (providerName) {
            providerName = this.#normalizeProviderName(providerName);
            this.#modelsCache.delete(providerName);
        } else {
            this.#modelsCache.clear();
        }
    }

    static isCached(providerName: string): boolean {
        providerName = this.#normalizeProviderName(providerName);
        return this.#modelsCache.has(providerName) && this.#modelsCache.get(providerName)!.size > 0;
    }

    static getCacheTimestamp(providerName: string): number | null {
        providerName = this.#normalizeProviderName(providerName);
        const cached = this.#modelsCache.get(providerName);
        if (cached && cached.size > 0) {
            return Date.now();
        }
        return null;
    }

    static getDefaultModels(): Record<string, string> {
        this.init();
        const providers = this.list();
        const models: Record<string, string> = {};
        providers.forEach(provider => {
            if (provider.defaultModel) {
                models[provider.name] = provider.defaultModel;
            }
        });
        return models;
    }

    static reset(): void {
        this.#providers.clear();
        this.#modelsCache.clear();
        this.#apiKeys.clear();
        this.#initialized = false;
        this.init();
    }
}

export default ProviderRegistry;
