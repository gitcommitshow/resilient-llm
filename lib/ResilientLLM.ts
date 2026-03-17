/**
 * A common interface to interact with AI models (with resilience: rate limiting, circuit breaker, retries).
 *
 * @example
 * import { ResilientLLM } from 'resilient-llm';
 * const llm = new ResilientLLM({ aiService: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 2048, temperature: 0 });
 * const response = await llm.chat([{ role: "user", content: "Hello, world!" }]);
 * console.log(response);
 * // Cancel all llm operations for this instance:
 * llm.abort();
 */

import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import { randomUUID } from "node:crypto";
import ResilientOperation from "./ResilientOperation.js";
import ProviderRegistry, { type ChatConfig } from "./ProviderRegistry.js";
import type { RateLimitConfig } from "./RateLimitManager.js";
import { StructuredOutput } from "./StructuredOutput.js";

export type { SchemaValidationIssue } from "./StructuredOutput.js";

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    [key: string]: unknown;
}

export interface ResilientLLMOptions {
    aiService?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    cacheStore?: Record<string, unknown>;
    maxInputTokens?: number;
    topP?: number;
    maxCompletionTokens?: number;
    reasoningEffort?: string;
    retries?: number;
    backoffFactor?: number;
    rateLimitConfig?: RateLimitConfig;
    circuitBreakerConfig?: { failureThreshold?: number; cooldownPeriod?: number };
    maxConcurrent?: number;
    onRateLimitUpdate?: (rateLimitInfo: RateLimitConfig) => void;
    onError?: (error: Error) => void;
    returnOperationMetadata?: boolean;
}

export interface LLMOptions {
    aiService?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    maxInputTokens?: number;
    topP?: number;
    maxCompletionTokens?: number;
    reasoningEffort?: string;
    retries?: number;
    backoffFactor?: number;
    rateLimitConfig?: RateLimitConfig;
    circuitBreakerConfig?: { failureThreshold?: number; cooldownPeriod?: number };
    maxConcurrent?: number;
    apiKey?: string;
    tools?: ToolDefinition[];
    responseFormat?: unknown;
    response_format?: unknown;
    outputConfig?: unknown;
    output_config?: unknown;
    parseStructuredOutput?: boolean;
    enableCache?: boolean;
    returnOperationMetadata?: boolean;
}

export interface ToolDefinition {
    type?: string;
    function: {
        name: string;
        description?: string;
        parameters?: unknown;
        input_schema?: unknown;
    };
}

export interface ObservabilityOptions {
    metadata?: OperationMetadata;
    [key: string]: unknown;
}

export interface OperationMetadata {
    requestId?: string | null;
    operationId?: string;
    startTime?: number | null;
    config?: Record<string, unknown>;
    events?: unknown[];
    timing?: { totalTimeMs?: number | null; rateLimitWaitMs?: number; httpRequestMs?: number | null };
    retries?: unknown[];
    rateLimiting?: { requestedTokens?: number; totalWaitMs?: number };
    circuitBreaker?: Record<string, unknown>;
    http?: Record<string, unknown>;
    cache?: Record<string, unknown>;
    service?: { attempted?: string[]; final?: string };
    usage?: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null };
    [key: string]: unknown;
}

export interface ChatResponseWithMetadata {
    content: string | Record<string, unknown> | ChatToolCallResult | null;
    metadata: OperationMetadata;
}

export interface ChatToolCallResult {
    content: string | null;
    toolCalls: unknown;
}

interface FinishReasonAnalysis {
    summary: string;
    tokensInfo: string;
    recommendation: string;
}

interface HttpResult {
    data: Record<string, unknown>;
    statusCode: number;
}

/**
 * ResilientLLM: unified chat interface with configurable provider, model, rate limits, circuit breaker, and retries.
 * Constructor options: aiService, model, temperature, maxTokens, timeout, cacheStore, maxInputTokens, topP,
 * rateLimitConfig, retries, backoffFactor, circuitBreakerConfig, maxConcurrent, onRateLimitUpdate, returnOperationMetadata.
 */
class ResilientLLM {
    static encoder: Tiktoken | undefined;
    static _safeHeaderPrefixes = ['x-ratelimit', 'rate-limit', 'retry-after', 'x-request-id', 'request-id'];

    aiService: string;
    model: string;
    temperature: number | string | undefined;
    maxTokens: number | string | undefined;
    cacheStore: Record<string, unknown>;
    maxInputTokens: number | string;
    topP: number | string | undefined;
    maxCompletionTokens: number | string | undefined;
    reasoningEffort: string | undefined;
    retries: number;
    backoffFactor: number;
    timeout: number | string;
    rateLimitConfig: RateLimitConfig;
    circuitBreakerConfig: { failureThreshold: number; cooldownPeriod: number };
    maxConcurrent: number | undefined;
    onRateLimitUpdate: ((rateLimitInfo: RateLimitConfig) => void) | undefined;
    returnOperationMetadata: boolean;
    resilientOperations: Record<string, ResilientOperation>;
    llmOutOfService?: string[];

    private _abortController: AbortController | null;

    constructor(options?: ResilientLLMOptions) {
        this.aiService = options?.aiService || process.env.PREFERRED_AI_SERVICE || "anthropic";
        this.model = options?.model || process.env.PREFERRED_AI_MODEL || "claude-haiku-4-5-20251001";
        this.temperature = options?.temperature ?? process.env.AI_TEMPERATURE;
        this.maxTokens = options?.maxTokens || process.env.MAX_TOKENS;
        this.cacheStore = options?.cacheStore || {};
        // Default to 100k to avoid accidental context window overflow
        this.maxInputTokens = options?.maxInputTokens || process.env.MAX_INPUT_TOKENS || 100000;
        this.topP = options?.topP ?? process.env.AI_TOP_P;
        this.maxCompletionTokens = options?.maxCompletionTokens ?? process.env.MAX_COMPLETION_TOKENS;
        this.reasoningEffort = options?.reasoningEffort ?? process.env.AI_REASONING_EFFORT;
        this.retries = options?.retries || 3;
        this.backoffFactor = options?.backoffFactor || 2;
        this.timeout = options?.timeout || process.env.LLM_TIMEOUT || 60000;
        this.rateLimitConfig = options?.rateLimitConfig || { requestsPerMinute: 10, llmTokensPerMinute: 150000 };
        this.circuitBreakerConfig = options?.circuitBreakerConfig
            ? { failureThreshold: options.circuitBreakerConfig.failureThreshold ?? 5, cooldownPeriod: options.circuitBreakerConfig.cooldownPeriod ?? 30000 }
            : { failureThreshold: 5, cooldownPeriod: 30000 };
        this.maxConcurrent = options?.maxConcurrent;
        this.onRateLimitUpdate = options?.onRateLimitUpdate;
        this.returnOperationMetadata = options?.returnOperationMetadata ?? false;
        this._abortController = null;
        this.resilientOperations = {}; // Store resilient operation instances for observability
    }

    /**
     * Chat with the LLM.
     * @param conversationHistory - Array of messages (role + content)
     * @param llmOptions - Overrides for this call (model, temperature, tools, apiKey, returnOperationMetadata, etc.)
     * @param observabilityOptions - Observability/metadata options
     * @returns Response content, or { content, metadata } when returnOperationMetadata is true
     */
    async chat(
        conversationHistory: ChatMessage[],
        llmOptions: LLMOptions = {},
        observabilityOptions: ObservabilityOptions = {}
    ): Promise<string | Record<string, unknown> | ChatToolCallResult | ChatResponseWithMetadata | null> {
        // TODO: Support dynamic selection/correction of params (e.g. reasoning vs non-reasoning models);
        const returnOperationMetadata = llmOptions?.returnOperationMetadata ?? this.returnOperationMetadata ?? false;
        const startTime = returnOperationMetadata ? Date.now() : null;
        const requestId = returnOperationMetadata ? randomUUID() : null;

        let requestBody: Record<string, unknown>;
        let headers: Record<string, string>;
        const aiService = llmOptions?.aiService || this.aiService;
        const model = llmOptions?.model || this.model;

        // Get provider configuration
        const providerConfig = ProviderRegistry.get(aiService);
        if (!providerConfig) {
            const available = ProviderRegistry.list().map(p => `"${p.name}"`).join(', ');
            throw new Error(`Invalid provider specified: "${aiService}". Available: ${available}`);
        }

        const chatConfig: ChatConfig = ProviderRegistry.getChatConfig(aiService) || {
            messageFormat: 'openai',
            responseParsePath: 'choices[0].message.content',
            toolSchemaType: 'openai'
        };

        // Get API URL from provider configuration
        let apiUrl = ProviderRegistry.getChatApiUrl(aiService);
        if (!apiUrl) {
            const available = ProviderRegistry.list().map(p => `"${p.name}"`).join(', ');
            throw new Error(`Invalid AI service: "${aiService}". Available: ${available}`);
        }

        // Validate API key for providers that require it (check llmOptions and registry)
        const hasApiKeyInOptions = !!llmOptions?.apiKey;
        const hasApiKeyInRegistry = ProviderRegistry.hasApiKey(aiService);
        if (!hasApiKeyInOptions && !hasApiKeyInRegistry && !providerConfig.authConfig?.optional) {
            const envVars = providerConfig.envVarNames?.join(' or ') || 'API_KEY';
            throw new Error(`${envVars} is not set for provider "${aiService}"`);
        }

        // Get API key early for URL building and headers
        const apiKey = llmOptions?.apiKey || null;

        // Handle query-parameter auth; buildApiUrl uses endpoint-specific auth when needed
        apiUrl = ProviderRegistry.buildApiUrl(aiService, apiUrl, apiKey);

        const maxInputTokens = Number(llmOptions?.maxInputTokens || this.maxInputTokens);

        // Estimate LLM tokens for this request
        const estimatedLLMTokens = ResilientLLM.estimateTokens(conversationHistory?.map(message => message?.content)?.join("\n"));
        console.log("Estimated LLM input tokens:", estimatedLLMTokens, "/", maxInputTokens);
        if (estimatedLLMTokens > maxInputTokens) {
            throw new Error("Input tokens exceed the maximum limit of " + maxInputTokens);
        }

        requestBody = {
            model: model
        };

        if (llmOptions?.tools) {
            requestBody.tools = llmOptions.tools;
        }
        // Accept both JS-style camelCase and HTTP-style snake_case aliases.
        // StructuredOutput normalizes these and rejects ambiguous duplicates.
        const structuredOutput = StructuredOutput.fromInputs({
            responseFormat: llmOptions?.responseFormat,
            response_format: llmOptions?.response_format,
            outputConfig: llmOptions?.outputConfig,
            output_config: llmOptions?.output_config,
        });
        const requestField = chatConfig.structuredOutputRequestField || 'response_format';
        const { responseFormat, outputConfig } = structuredOutput.getRequestFields(requestField);
        if (responseFormat !== undefined) {
            requestBody.response_format = responseFormat;
        }
        if (outputConfig !== undefined) {
            requestBody.output_config = outputConfig;
        }
        if (model?.startsWith("o") || model?.startsWith("gpt-5")) {
            // Reasoning model parameters
            const maxCompletionTokens = llmOptions?.maxCompletionTokens ?? this.maxCompletionTokens ?? llmOptions?.maxTokens ?? this.maxTokens;
            if (maxCompletionTokens != null) {
                requestBody.max_completion_tokens = Number(maxCompletionTokens);
            }
            const reasoningEffort = llmOptions?.reasoningEffort ?? this.reasoningEffort;
            if (reasoningEffort != null) {
                requestBody.reasoning_effort = reasoningEffort;
            }
        } else {
            requestBody.max_tokens = Number(llmOptions?.maxTokens || this.maxTokens);
            const temperature = llmOptions?.temperature ?? this.temperature;
            if (temperature != null) {
                requestBody.temperature = Number(temperature);
            }
            const topP = llmOptions?.topP ?? this.topP;
            if (topP != null) {
                requestBody.top_p = Number(topP);
            }
        }

        // Format messages based on provider configuration
        if (chatConfig.messageFormat === 'anthropic') {
            const { system, messages } = this.formatMessageForAnthropic(conversationHistory);
            if (system) requestBody.system = system;
            requestBody.messages = messages;
        } else {
            // Default: 'openai' format (keep system in messages)
            requestBody.messages = conversationHistory;
            if (process.env.STORE_AI_API_CALLS === 'true' && providerConfig.name === 'openai') {
                requestBody.store = true;
            }
        }

        // Handle tool schema conversion based on provider
        if ((requestBody.tools as ToolDefinition[] | undefined)?.length) {
            const toolDefinitions: ToolDefinition[] = JSON.parse(JSON.stringify(requestBody.tools));
            if (chatConfig.toolSchemaType === 'anthropic') {
                // Convert to Anthropic format (input_schema)
                for (const tool of toolDefinitions) {
                    if (!tool.function.input_schema && tool.function.parameters) {
                        tool.function.input_schema = tool.function.parameters;
                        delete tool.function.parameters;
                    }
                }
            } else {
                // Convert to OpenAI format (parameters)
                for (const tool of toolDefinitions) {
                    if (!tool.function.parameters && tool.function.input_schema) {
                        tool.function.parameters = tool.function.input_schema;
                        delete tool.function.input_schema;
                    }
                }
            }
            requestBody.tools = toolDefinitions;
        }

        const defaultHeaders: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        headers = ProviderRegistry.buildAuthHeaders(aiService, apiKey, defaultHeaders, apiUrl);

        const effectiveResilienceConfig = {
            timeout: Number(llmOptions?.timeout ?? this.timeout),
            retries: llmOptions?.retries ?? this.retries,
            backoffFactor: llmOptions?.backoffFactor ?? this.backoffFactor,
            circuitBreakerConfig: {
                failureThreshold: llmOptions?.circuitBreakerConfig?.failureThreshold ?? this.circuitBreakerConfig?.failureThreshold,
                cooldownPeriod: llmOptions?.circuitBreakerConfig?.cooldownPeriod ?? this.circuitBreakerConfig?.cooldownPeriod
            },
            rateLimitConfig: {
                requestsPerMinute: llmOptions?.rateLimitConfig?.requestsPerMinute ?? this.rateLimitConfig?.requestsPerMinute,
                llmTokensPerMinute: llmOptions?.rateLimitConfig?.llmTokensPerMinute ?? this.rateLimitConfig?.llmTokensPerMinute
            },
            maxConcurrent: llmOptions?.maxConcurrent ?? this.maxConcurrent,
        };

        let metadata: OperationMetadata | null = null;
        let resilientOperation: ResilientOperation | null = null;
        try {
            resilientOperation = new ResilientOperation({
                bucketId: llmOptions?.aiService || this.aiService,
                ...effectiveResilienceConfig,
                collectMetrics: returnOperationMetadata,
                onRateLimitUpdate: this.onRateLimitUpdate,
                cacheStore: this.cacheStore
            });

            if (returnOperationMetadata) {
                const temperature = llmOptions?.temperature ?? this.temperature;
                const topP = llmOptions?.topP ?? this.topP;
                const effectiveMaxTokens = (requestBody.max_completion_tokens ?? requestBody.max_tokens ?? null) as number | null;
                const enableCache = llmOptions?.enableCache ?? true;
                metadata = {
                    requestId,
                    operationId: resilientOperation.id,
                    startTime,
                    config: {
                        aiService,
                        model,
                        temperature: temperature != null ? Number(temperature) : null,
                        maxTokens: effectiveMaxTokens,
                        topP: topP != null ? Number(topP) : null,
                        maxInputTokens,
                        estimatedInputTokens: estimatedLLMTokens,
                        enableCache,
                        ...effectiveResilienceConfig,
                    },
                    events: [],
                    timing: { totalTimeMs: null, rateLimitWaitMs: 0, httpRequestMs: null },
                    retries: [],
                    rateLimiting: { requestedTokens: estimatedLLMTokens, totalWaitMs: 0 },
                    circuitBreaker: {},
                    http: {},
                    cache: { enabled: enableCache },
                    service: { attempted: [aiService], final: aiService },
                };
                observabilityOptions = { ...observabilityOptions, metadata };
            }

            if (!this._abortController || this._abortController.signal.aborted) {
                this._abortController = new AbortController();
            }
            this.resilientOperations[resilientOperation.id] = resilientOperation;
            const { data, statusCode } = await resilientOperation
                .withTokens(estimatedLLMTokens)
                .withCache(llmOptions?.enableCache ?? true)
                .withAbortControl(this._abortController)
                .execute(
                    this._makeHttpRequest as (...args: unknown[]) => Promise<unknown>,
                    apiUrl, requestBody, headers, this._abortController.signal, observabilityOptions
                ) as HttpResult;

            console.log("LLM chat status code:", statusCode, (data as Record<string, unknown>)?.error ? ((data as Record<string, unknown>).error as Record<string, unknown>)?.message : undefined);
            if ([429, 529].includes(statusCode)) {
                return await this.retryChatWithAlternateService(conversationHistory, llmOptions);
            }
            const dataAsArray = data as unknown as Record<string, unknown>[];
            if (data?.error || (Array.isArray(data) && dataAsArray[0]?.error)) {
                throw new Error(
                    ((data?.error as Record<string, unknown>)?.message as string) ||
                    ((dataAsArray?.[0]?.error as Record<string, unknown>)?.message as string)
                );
            }
            if (statusCode !== 200) {
                // Future: handle other status codes
            }

            const content = this.parseChatCompletion(data, chatConfig, llmOptions?.tools);
            const shouldParseStructuredOutput = llmOptions?.parseStructuredOutput ?? true;
            const normalizedContent = shouldParseStructuredOutput ? structuredOutput.parse(content) : content;
            const effectiveContent = (normalizedContent && typeof normalizedContent === 'object' && 'content' in normalizedContent)
                ? (normalizedContent as ChatToolCallResult).content
                : normalizedContent;
            const isEmpty = effectiveContent == null || (typeof effectiveContent === 'string' && effectiveContent.trim() === '');
            if (isEmpty) {
                console.warn("Empty response from LLM");
            }
            const analysis = this._analyzeFinishReason(data);
            if (analysis) {
                console.log(analysis.summary);
                console.log(analysis.tokensInfo);
                console.log(analysis.recommendation);
            }

            delete this.resilientOperations[resilientOperation.id];

            if (returnOperationMetadata && metadata) {
                const runtimeMetrics = resilientOperation.getRuntimeMetrics();
                const usageData = data?.usage && typeof data.usage === 'object'
                    ? (data.usage as Record<string, unknown>)
                    : {};

                metadata = ResilientLLM._buildOperationMetadata({
                    base: metadata,
                    aiService,
                    estimatedLLMTokens,
                    startTime: startTime!,
                    now: Date.now(),
                    runtimeMetrics,
                    usageData,
                    phase: 'success',
                    llmOptions,
                });

                return { content: normalizedContent as string | Record<string, unknown> | ChatToolCallResult | null, metadata } as ChatResponseWithMetadata;
            }
            return normalizedContent;
        } catch (error) {
            console.error(`Error calling ${aiService} API:`, error);
            if (returnOperationMetadata && metadata) {
                const runtimeMetrics = resilientOperation?.getRuntimeMetrics() ?? null;
                metadata = ResilientLLM._buildOperationMetadata({
                    base: metadata,
                    aiService,
                    estimatedLLMTokens,
                    startTime: startTime!,
                    now: Date.now(),
                    runtimeMetrics,
                    phase: 'error',
                    llmOptions,
                });
            }
            this.parseError(null, error as Error, returnOperationMetadata ? metadata : null);
            return null; // unreachable since parseError always throws, but satisfies TS
        }
    }

    async retryChatWithAlternateService(
        conversationHistory: ChatMessage[],
        llmOptions: LLMOptions = {}
    ): Promise<string | Record<string, unknown> | ChatToolCallResult | ChatResponseWithMetadata | null> {
        this.llmOutOfService = this.llmOutOfService || [];
        const currentService = llmOptions?.aiService || this.aiService;
        this.llmOutOfService.push(currentService);
        const defaultModels = ProviderRegistry.getDefaultModels();
        for (const [providerName, defaultModel] of Object.entries(defaultModels)) {
            if (!this.llmOutOfService.includes(providerName)) {
                console.log("Switching LLM service to:", providerName, defaultModel);
                const newLLMOptions = Object.assign(llmOptions, {
                    aiService: providerName,
                    model: defaultModel
                });
                return this.chat(conversationHistory, newLLMOptions);
            }
        }
        throw new Error("No alternative model found");
    }

    async _makeHttpRequest(
        apiUrl: string,
        requestBody: Record<string, unknown>,
        headers: Record<string, string>,
        abortSignal: AbortSignal,
        observabilityOptions?: ObservabilityOptions
    ): Promise<HttpResult> {
        console.log("Making HTTP request to:", apiUrl);
        console.log("You may cancel it by calling abort() method on the ResilientLLM instance");
        const httpStartTime = Date.now();

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody),
                signal: abortSignal
            });

            console.log("Response Headers:", response?.headers);

            const data = await response?.json() as Record<string, unknown>;

            const result: HttpResult = { data, statusCode: response?.status };

            const httpDurationMs = Date.now() - httpStartTime;
            console.log(`Request to ${apiUrl} completed in ${httpDurationMs} ms`);

            if (observabilityOptions?.metadata) {
                ResilientLLM._captureHttpMetadata(observabilityOptions.metadata, apiUrl, response, httpDurationMs);
            }

            return result;
        } catch (error) {
            const httpDurationMs = Date.now() - httpStartTime;
            console.log(`Request to ${apiUrl} failed in ${httpDurationMs} ms`);

            if (observabilityOptions?.metadata) {
                ResilientLLM._captureHttpMetadata(observabilityOptions.metadata, apiUrl, null, httpDurationMs, error as Error);
            }

            if ((error as Error).name === 'AbortError') {
                console.error(`Request to ${apiUrl} timed out or was cancelled`);
            }
            console.error(`Error in request to ${apiUrl}:`, error);
            throw error;
        }
    }

    /**
     * Builds the operation metadata object.
     */
    private static _buildOperationMetadata(params: {
        base: OperationMetadata | null;
        aiService: string;
        estimatedLLMTokens: number;
        startTime: number;
        now: number;
        runtimeMetrics: ReturnType<ResilientOperation['getRuntimeMetrics']> | null;
        usageData?: Record<string, unknown>;
        phase: 'success' | 'error';
        llmOptions: LLMOptions;
    }): OperationMetadata {
        const {
            base,
            aiService,
            estimatedLLMTokens,
            startTime,
            now,
            runtimeMetrics,
            usageData,
            phase,
            llmOptions,
        } = params;

        const prev = base ?? {};

        const timingPrev = prev.timing ?? {};
        const totalTimeMs = now - startTime;

        const timing = {
            totalTimeMs,
            rateLimitWaitMs: runtimeMetrics?.rateLimiting?.totalWaitMs ?? timingPrev.rateLimitWaitMs ?? 0,
            httpRequestMs: timingPrev.httpRequestMs ?? null,
        };

        const rateLimiting = {
            requestedTokens: prev.rateLimiting?.requestedTokens ?? estimatedLLMTokens,
            totalWaitMs: runtimeMetrics?.rateLimiting?.totalWaitMs
                ?? prev.rateLimiting?.totalWaitMs
                ?? 0,
        };

        const circuitBreaker = {
            ...(prev.circuitBreaker ?? {}),
            ...(runtimeMetrics?.circuitBreaker as unknown as Record<string, unknown> | null ?? {}),
        };

        const cache = {
            ...(prev.cache ?? { enabled: llmOptions?.enableCache ?? true }),
            ...(runtimeMetrics?.cache ?? {}),
        };

        const usage =
            phase === 'success' && usageData && typeof usageData === 'object'
                ? (() => {
                      const pt = usageData.prompt_tokens as number | undefined;
                      const ct = usageData.completion_tokens as number | undefined;
                      const tot =
                          (usageData.total_tokens as number | undefined) ??
                          (pt != null && ct != null ? pt + ct : null);
                      return {
                          prompt_tokens: pt ?? null,
                          completion_tokens: ct ?? null,
                          total_tokens: tot ?? null,
                      };
                  })()
                : prev.usage;

        const service = prev.service ?? { attempted: [aiService], final: aiService };

        return {
            ...prev,
            timing,
            rateLimiting,
            circuitBreaker,
            cache,
            usage,
            service,
        };
    }

    static _captureHttpMetadata(
        metadata: OperationMetadata,
        apiUrl: string,
        response: Response | null,
        durationMs: number,
        error?: Error
    ): void {
        let sanitizedUrl: string;
        try {
            const parsed = new URL(apiUrl);
            parsed.search = '';
            sanitizedUrl = parsed.toString();
        } catch {
            sanitizedUrl = apiUrl;
        }

        const safeHeaders: Record<string, string> = {};
        if (response?.headers) {
            for (const [name, value] of response.headers.entries()) {
                const lower = name.toLowerCase();
                if (ResilientLLM._safeHeaderPrefixes.some(prefix => lower.startsWith(prefix) || lower === prefix)) {
                    safeHeaders[name] = value;
                }
            }
        }

        metadata.http = {
            url: sanitizedUrl,
            method: 'POST',
            statusCode: response?.status ?? null,
            headers: safeHeaders,
            durationMs,
            ...(error ? { error: error.message } : {}),
        };
        if (!metadata.timing) {
            metadata.timing = { totalTimeMs: null, rateLimitWaitMs: 0, httpRequestMs: null };
        }
        metadata.timing.httpRequestMs = durationMs;
    }

    parseError(statusCode: number | null, error: Error, operationMetadata?: OperationMetadata | null): never {
        let err: Error & { metadata?: OperationMetadata };
        switch (statusCode) {
            case 400:
                console.error("Bad request");
                err = new Error(error?.message || "Bad request");
                break;
            case 401:
                console.error("Invalid API Key");
                err = new Error(error?.message || "Invalid API Key");
                break;
            case 403:
                err = new Error(error?.message || "You are not authorized to access this resource");
                break;
            case 429:
                err = new Error(error?.message || "Rate limit exceeded");
                break;
            case 404:
                err = new Error(error?.message || "Not found");
                break;
            case 500:
                err = new Error(error?.message || "Internal server error");
                break;
            case 503:
                err = new Error(error?.message || "Service unavailable");
                break;
            case 529:
                err = new Error(error?.message || "API temporarily overloaded");
                break;
            default:
                err = new Error(error?.message || "Unknown error");
        }
        const passthrough = Object.fromEntries(
            Object.entries(error as unknown as Record<string, unknown>).filter(([key]) => !['name', 'message', 'stack'].includes(key))
        );
        Object.assign(err, passthrough);
        if (operationMetadata) {
            err.metadata = operationMetadata;
        }
        throw err;
    }

    /**
     * Converts the messages array to the format required by Anthropic
     * Extracts system messages into a separate system field
     * @param {Array} messages - Array of message objects
     * @returns {Object} Object with system (string) and messages (array) properties
     * @example 
     * const llm = new ResilientLLM({ aiService: "anthropic", model: "claude-haiku-4-5-20251001" });
     * const { system, messages } = llm.formatMessageForAnthropic(originalMessages);
     * // originalMessages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Hello, world!" }]
     * // system: "You are a helpful assistant."
     * // messages: [{ role: "user", content: "Hello, world!" }]
     */
    formatMessageForAnthropic(messages: ChatMessage[]): { system: string | undefined; messages: ChatMessage[] } {
        let system: string | undefined;
        const messagesWithoutSystemMessage: ChatMessage[] = [];
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role === "system" && messages[i].content) {
                system = messages[i].content;
            } else {
                messagesWithoutSystemMessage.push(messages[i]);
            }
        }
        return { system, messages: messagesWithoutSystemMessage };
    }

    /**
     * Analyze and summarize finish_reason and token usage, with actionable plain-English recommendations.
     * @param {Object} data - Raw API response data
     * @param {number} data.choices[0].finish_reason - Finish reason
     * @param {Object} data.usage - Usage object
     * @param {number} data.usage.prompt_tokens - Prompt tokens
     * @param {number} data.usage.completion_tokens - Completion tokens
     * @param {number} data.usage.total_tokens - Total tokens
     * @returns {Object} Object with summary, tokensInfo, and recommendation properties
     * @example
     * const { summary, tokensInfo, recommendation } = llm._analyzeFinishReason(data);
     * // data: { choices: [{ finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }
     * // summary: "✅ The model replied fully and finished normally with no issues."
     * // tokensInfo: "Prompt tokens used: 10 | Completion tokens used: 10 | Total tokens: 20"
     * // recommendation: "Tip: You used 10 prompt tokens and 10 for the reply (total: 20). For best performance and efficiency, try to keep the total under 1500 tokens."
     * @private
     */
    _analyzeFinishReason(data: Record<string, unknown>): FinishReasonAnalysis | null {
        if (!data) return null;

        const choices = data?.choices as Record<string, unknown>[] | undefined;
        const choice = choices?.[0];
        const finishReason = (choice?.finish_reason as string) ?? null;
        const usage = (data?.usage || {}) as Record<string, unknown>;
        const hasPromptTokens = usage?.prompt_tokens != null;
        const hasCompletionTokens = usage?.completion_tokens != null;
        const promptTokens = hasPromptTokens ? usage.prompt_tokens as number : null;
        const completionTokens = hasCompletionTokens ? usage.completion_tokens as number : null;
        const totalTokens =
            (usage?.total_tokens as number | undefined) ??
            ((hasPromptTokens && hasCompletionTokens)
                ? promptTokens! + completionTokens!
                : null);

        let summary = "";
        let recommendation = "";
        let tokensInfo = "";

        const calculatedRecommendedMax =
            (hasCompletionTokens && completionTokens !== null)
                ? Math.ceil(completionTokens * 1.2)
                : undefined;

        switch (finishReason) {
            case "length":
                summary =
                    "⚠️ The model stopped because it reached the set output token limit and couldn't finish its answer.";
                recommendation =
                    calculatedRecommendedMax
                        ? `Recommendation: To get complete answers, set max_tokens (or max_completion_tokens) to at least ${calculatedRecommendedMax} (20% above what was just used), or trim your input prompt/context.`
                        : "Recommendation: To get complete answers, increase max_tokens (or max_completion_tokens) or trim your input prompt/context.";
                break;
            case "content_filter":
                summary =
                    "⚠️ The model stopped due to violating content policy or safety filters.";
                recommendation =
                    "Recommendation: Review your prompt and output for sensitive or restricted content, and revise as needed.";
                break;
            case "function_call":
                summary =
                    "⛏️ The model paused to perform a function or tool call as requested.";
                recommendation =
                    "Recommendation: Handle the tool or function call with your code, then continue the conversation.";
                break;
            case "stop":
                summary =
                    "✅ The model replied fully and finished normally with no issues.";
                if ((totalTokens != null && totalTokens > 0) && (hasPromptTokens || hasCompletionTokens)) {
                    const tokenParts: string[] = [];
                    if (hasPromptTokens) tokenParts.push(`${promptTokens} prompt tokens`);
                    if (hasCompletionTokens) tokenParts.push(`${completionTokens} for the reply`);
                    recommendation =
                        `Tip: You used${tokenParts.length ? ' ' + tokenParts.join(' and ') : ''}${totalTokens !== null ? ` (total: ${totalTokens})` : ""}. For best performance and efficiency, try to keep the total under ${Math.max(1500, totalTokens ?? 1500)} tokens.`;
                }
                break;
            case null:
            case undefined:
                summary = "ℹ️ No finish reason reported.";
                break;
            default:
                summary = `ℹ️ Response stopped with finish_reason: "${finishReason}".`;
                recommendation = "Recommendation: Check the API documentation for this finish_reason.";
        }

        if (hasPromptTokens || hasCompletionTokens || totalTokens != null) {
            tokensInfo = [
                hasPromptTokens
                    ? `Prompt tokens used: ${promptTokens}`
                    : "",
                hasCompletionTokens
                    ? `Completion tokens used: ${completionTokens}`
                    : "",
                totalTokens != null
                    ? `Total tokens: ${totalTokens}`
                    : ""
            ]
                .filter(Boolean)
                .join(" | ");
        } else {
            tokensInfo = "";
        }

        return { summary, tokensInfo, recommendation };
    }

    /**
     * The standard method to parse OpenAI-compatible chat completion response using provider configuration
     * @param {Object} data - Response data from API
     * @param {Object} chatConfig - Chat configuration from provider
     * @param {boolean|Array} tools - Whether tools are enabled or tool definitions
     * @returns {string|Object} Parsed content or object with content and toolCalls
     */
    parseChatCompletion(
        data: Record<string, unknown>,
        chatConfig: ChatConfig,
        tools?: ToolDefinition[]
    ): string | ChatToolCallResult | null {
        if (!data) {
            return null;
        }

        const parsePath = chatConfig?.responseParsePath || 'choices[0].message.content';
        const content = this._getNestedValue(data, parsePath) as string | null;

        if (tools) {
            const choices = data?.choices as Record<string, unknown>[] | undefined;
            const dataContent = data?.content as Record<string, unknown>[] | undefined;
            const toolCalls = choices?.[0]?.message
                ? (choices[0].message as Record<string, unknown>)?.tool_calls
                : dataContent?.[0]?.tool_use || null;
            if (toolCalls) {
                return { content, toolCalls };
            }
        }

        return content;
    }

    /**
     * Helper method to get nested value from object using path notation
     * Supports both dot notation and bracket notation (e.g., 'choices[0].message.content')
     * @private
     * @example
     * const value = _getNestedValue(data, 'choices[0].message.content');
     * // data: { choices: [{ message: { content: "Hello, world!" } }] }
     * // value: "Hello, world!"
     */
    _getNestedValue(obj: unknown, path: string): unknown {
        if (!path || !obj) return null;

        const parts = path.split(/[.\[\]]+/).filter(p => p);
        let current: unknown = obj;

        for (const part of parts) {
            if (current == null) {
                return null;
            }

            const index = parseInt(part, 10);
            if (!isNaN(index) && Array.isArray(current) && index >= 0 && index < current.length) {
                current = current[index];
            } else if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
                current = (current as Record<string, unknown>)[part];
            } else {
                return null;
            }
        }

        return current;
    }

    /** @deprecated Use parseChatCompletion with chatConfig instead */
    parseOpenAIChatCompletion(data: Record<string, unknown>, tools?: unknown): string | { content: string; toolCalls: unknown } | undefined {
        if (tools) {
            const choices = data?.choices as Record<string, unknown>[] | undefined;
            const message = choices?.[0]?.message as Record<string, unknown> | undefined;
            return { content: message?.content as string, toolCalls: message?.tool_calls };
        }
        const choices = data?.choices as Record<string, unknown>[] | undefined;
        const message = choices?.[0]?.message as Record<string, unknown> | undefined;
        return message?.content as string | undefined;
    }

    /** @deprecated Use parseChatCompletion with chatConfig instead */
    parseAnthropicChatCompletion(data: Record<string, unknown>, _tools?: unknown): string | undefined {
        const content = data?.content as Record<string, unknown>[] | undefined;
        return content?.[0]?.text as string | undefined;
    }

    /** @deprecated Use parseChatCompletion with chatConfig instead */
    parseOllamaChatCompletion(data: Record<string, unknown>, _tools?: unknown): unknown {
        return data?.response;
    }

    /** @deprecated Use parseChatCompletion with chatConfig instead */
    parseGoogleChatCompletion(data: Record<string, unknown>, _tools?: unknown): string | undefined {
        const choices = data?.choices as Record<string, unknown>[] | undefined;
        const message = choices?.[0]?.message as Record<string, unknown> | undefined;
        return message?.content as string | undefined;
    }

    /** Cancel all in-flight operations for this instance. */
    abort(): void {
        this._abortController?.abort();
        this._abortController = null;
        this.resilientOperations = {};
    }

    /** Estimate token count for text (uses tiktoken when available; fallback ~chars/4). */
    static estimateTokens(text: string): number {
        if (text.length > 10000) {
            return Math.ceil(text.length / 4);
        }

        if (!ResilientLLM.encoder) {
            ResilientLLM.encoder = new Tiktoken(o200k_base);
        }
        return ResilientLLM.encoder.encode(text).length;
    }
}

export default ResilientLLM;
