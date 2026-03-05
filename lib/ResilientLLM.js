/**
 * A common interface to interact with AI models
 * @example
 * import { ResilientLLM } from 'resilient-llm';
 * const llm = new ResilientLLM({ aiService: "anthropic", model: "claude-haiku-4-5-20251001", maxTokens: 2048, temperature: 0 });
 * const response = await llm.chat([{ role: "user", content: "Hello, world!" }]);
 * console.log(response);
 * // You may cancel all llm operations (for the given instance) by calling abort() method on the ResilientLLM instance
 * llm.abort();
 */
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import { randomUUID } from "node:crypto";
import ResilientOperation from "./ResilientOperation.js";
import ProviderRegistry from "./ProviderRegistry.js";

/**
 * ResilientLLM class
 * @class
 * @param {Object} options - The options for the ResilientLLM instance
 * @param {string} options.aiService - The AI service to use
 * @param {string} options.model - The model to use
 * @param {number} options.temperature - The temperature for the LLM
 * @param {number} options.maxTokens - The maximum number of tokens for the LLM
 * @param {number} options.timeout - The timeout for the LLM
 * @param {Object} options.cacheStore - The cache store for the LLM
 * @param {number} options.maxInputTokens - The maximum number of input tokens for the LLM
 * @param {number} options.topP - The top P for the LLM
 * @param {Object} options.rateLimitConfig - The rate limit config for the LLM
 * @param {number} options.retries - The number of retries for the LLM
     * @param {number} options.backoffFactor - The backoff factor for the LLM
     * @param {Function} options.onRateLimitUpdate - The function to call when the rate limit is updated
     * @param {Function} options.onError - The function to call when an error occurs
 * @param {boolean} options.returnOperationMetadata - When true, chat() returns { content, metadata } instead of just content
 * @example
 * import { ResilientLLM } from 'resilient-llm';
 * const llm = new ResilientLLM({
 *   aiService: "anthropic",
 *   model: "claude-haiku-4-5-20251001",
 *   temperature: 0,
 *   maxTokens: 2048,
 * });
 * const response = await llm.chat([{ role: "user", content: "Hello, world!" }]);
 * console.log(response);
 */
class ResilientLLM {
    static encoder;

    constructor(options) {
        this.aiService = options?.aiService || process.env.PREFERRED_AI_SERVICE || "anthropic";
        this.model = options?.model || process.env.PREFERRED_AI_MODEL || "claude-haiku-4-5-20251001";
        this.temperature = options?.temperature ?? process.env.AI_TEMPERATURE;
        this.maxTokens = options?.maxTokens || process.env.MAX_TOKENS;
        this.cacheStore = options?.cacheStore || {};
        this.maxInputTokens = options?.maxInputTokens || process.env.MAX_INPUT_TOKENS || 100000; //default to 100k to avoid accidental context window overflow
        this.topP = options?.topP ?? process.env.AI_TOP_P;
        this.maxCompletionTokens = options?.maxCompletionTokens ?? process.env.MAX_COMPLETION_TOKENS;
        this.reasoningEffort = options?.reasoningEffort ?? process.env.AI_REASONING_EFFORT;
        // Add rate limit config options if provided
        this.retries = options?.retries || 3;
        this.backoffFactor = options?.backoffFactor || 2;
        this.timeout = options?.timeout || process.env.LLM_TIMEOUT || 60000;
        this.rateLimitConfig = options?.rateLimitConfig || { requestsPerMinute: 10, llmTokensPerMinute: 150000 };
        this.circuitBreakerConfig = options?.circuitBreakerConfig || { failureThreshold: 5, cooldownPeriod: 30000 };
        this.maxConcurrent = options?.maxConcurrent;
        this.onRateLimitUpdate = options?.onRateLimitUpdate;
        this.returnOperationMetadata = options?.returnOperationMetadata ?? false;
        this._abortController = null;
        this.resilientOperations = {}; // Store resilient operation instances for observability
    }


    /**
     * Chat with the LLM
     * @param {Array} conversationHistory - The conversation history
     * @param {Object} llmOptions - The LLM options
     * @param {Object} observabilityOptions - The observability options
     * @returns {Promise<string|Object>} - The response from the LLM
     */
    async chat(conversationHistory, llmOptions = {}, observabilityOptions = {}) {
        //TODO: Support reasoning models, they have different parameters
        const returnOperationMetadata = llmOptions?.returnOperationMetadata ?? this.returnOperationMetadata ?? false;
        const startTime = returnOperationMetadata ? Date.now() : null;
        const requestId = returnOperationMetadata ? randomUUID() : null;

        let requestBody, headers;
        let aiService = llmOptions?.aiService || this.aiService;
        let model = llmOptions?.model || this.model;
        
        // Get provider configuration
        const providerConfig = ProviderRegistry.get(aiService);
        if (!providerConfig) {
            const available = ProviderRegistry.list().map(p => `"${p.name}"`).join(', ');
            throw new Error(`Invalid provider specified: "${aiService}". Available: ${available}`);
        }
        
        const chatConfig = ProviderRegistry.getChatConfig(aiService) || {
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
        
        // Validate API key for providers that require it
        // Check both llmOptions and registry for API key
        const hasApiKeyInOptions = !!llmOptions?.apiKey;
        const hasApiKeyInRegistry = ProviderRegistry.hasApiKey(aiService);
        if (!hasApiKeyInOptions && !hasApiKeyInRegistry && !providerConfig.authConfig?.optional) {
            const envVars = providerConfig.envVarNames?.join(' or ') || 'API_KEY';
            throw new Error(`${envVars} is not set for provider "${aiService}"`);
        }
        
        // Get API key early so it can be used for both URL building and headers
        const apiKey = llmOptions?.apiKey || null;
        
        // Handle query parameter authentication (buildApiUrl handles this internally)
        // Auto-detects endpoint-specific auth config from URL
        // Pass apiKey so it can be used for query parameter auth if needed
        apiUrl = ProviderRegistry.buildApiUrl(aiService, apiUrl, apiKey);
        
        const maxInputTokens = llmOptions?.maxInputTokens || this.maxInputTokens;
        
        // Estimate LLM tokens for this request
        const estimatedLLMTokens = ResilientLLM.estimateTokens(conversationHistory?.map(message => message?.content)?.join("\n"));
        console.log("Estimated LLM input tokens:", estimatedLLMTokens, "/", maxInputTokens);
        if(estimatedLLMTokens > maxInputTokens){
            throw new Error("Input tokens exceed the maximum limit of " + maxInputTokens);
        }
        
        requestBody = {
            model: model
        };
        
        if(llmOptions?.tools){
            requestBody.tools = llmOptions.tools;
        }
        if(llmOptions?.responseFormat){
            requestBody.response_format = llmOptions.responseFormat;
        }
        if(requestBody.model?.startsWith("o") || requestBody.model?.startsWith("gpt-5")){
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
            if(system) requestBody.system = system;
            requestBody.messages = messages;
        } else {
            // Default: 'openai' format (keep system in messages)
            requestBody.messages = conversationHistory;
            if(process.env.STORE_AI_API_CALLS === 'true' && providerConfig.name === 'openai'){
                requestBody.store = true;
            }
        }
        
        // Handle tool schema conversion based on provider
        if(requestBody.tools?.length){
            let toolDefinitions = JSON.parse(JSON.stringify(requestBody.tools));
            if (chatConfig.toolSchemaType === 'anthropic') {
                // Convert to Anthropic format (input_schema)
                for(let tool of toolDefinitions){
                    if(!tool.function.input_schema && tool.function.parameters){
                        tool.function.input_schema = tool.function.parameters;
                        delete tool.function.parameters;
                    }
                }
            } else {
                // Convert to OpenAI format (parameters)
                for(let tool of toolDefinitions){
                    if(!tool.function.parameters && tool.function.input_schema){
                        tool.function.parameters = tool.function.input_schema;
                        delete tool.function.input_schema;
                    }
                }
            }
            requestBody.tools = toolDefinitions;
        }
        
        // Build headers generically using provider auth config
        // buildAuthHeaders will automatically retrieve API key if not provided
        // Pass apiUrl for endpoint-specific auth config detection
        const defaultHeaders = {
            'Content-Type': 'application/json'
        };
        // apiKey was already extracted above, use it here
        headers = ProviderRegistry.buildAuthHeaders(aiService, apiKey, defaultHeaders, apiUrl);

        const effectiveResilienceConfig = {
            timeout: llmOptions?.timeout ?? this.timeout,
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

        try{
            const resilientOperation = new ResilientOperation({
                bucketId: llmOptions?.aiService || this.aiService,
                ...effectiveResilienceConfig,
                collectMetrics: returnOperationMetadata,
                onRateLimitUpdate: this.onRateLimitUpdate,
                cacheStore: this.cacheStore
            });

            let metadata = null;
            if (returnOperationMetadata) {
                const temperature = llmOptions?.temperature ?? this.temperature;
                const topP = llmOptions?.topP ?? this.topP;
                const effectiveMaxTokens = requestBody.max_completion_tokens ?? requestBody.max_tokens ?? null;
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

            // Use single instance of abort controller for all operations
            if (!this._abortController || this._abortController.signal.aborted) {
                this._abortController = new AbortController();
            }
            this.resilientOperations[resilientOperation.id] = resilientOperation;
            // Wrap the LLM API call in ResilientOperation for rate limiting, retries, etc.
            const { data, statusCode } = await resilientOperation
                .withTokens(estimatedLLMTokens)
                .withCache(llmOptions?.enableCache ?? true)
                .withAbortControl(this._abortController)
                .execute(this._makeHttpRequest, apiUrl, requestBody, headers, this._abortController.signal, observabilityOptions);
            /**
             * OpenAI chat completion response
             * {
            "id": "chatcmpl-123456",
            "object": "chat.completion",
            "created": 1728933352,
            "model": "gpt-4o-2024-08-06",
            "choices": [
                {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hi there! How can I assist you today?",
                    "refusal": null
                },
                "logprobs": null,
                "finish_reason": "stop"
                }
            ],
            "usage": {
                "prompt_tokens": 19,
                "completion_tokens": 10,
                "total_tokens": 29,
                "prompt_tokens_details": {
                "cached_tokens": 0
                },
                "completion_tokens_details": {
                "reasoning_tokens": 0,
                "accepted_prediction_tokens": 0,
                "rejected_prediction_tokens": 0
                }
            },
            "system_fingerprint": "fp_6b68a8204b"
            */
            console.log("LLM chat status code:", statusCode, data?.error?.message);
            if([429, 529].includes(statusCode)){
                return await this.retryChatWithAlternateService(conversationHistory, llmOptions);
            }
            if(data?.error || (Array.isArray(data) && data[0]?.error)){
                throw new Error(data?.error?.message || data[0]?.error?.message);
            }
            if(statusCode !== 200){
                //TODO: Handle other status codes
            }
            
            // Parse response generically using provider configuration
            const content = this.parseChatCompletion(data, chatConfig, llmOptions?.tools);
            const effectiveContent = (content && typeof content === 'object' && 'content' in content)
                ? content.content
                : content;
            const isEmpty = effectiveContent == null || (typeof effectiveContent === 'string' && effectiveContent.trim() === '');
            if (isEmpty) {
                console.warn("Empty response from LLM");
            }
            const analysis = this._analyzeFinishReason(data);
            if(analysis){
                console.log(analysis.summary);
                console.log(analysis.tokensInfo);
                console.log(analysis.recommendation);
            }

            delete this.resilientOperations[resilientOperation.id];

            if (returnOperationMetadata && metadata) {
                const runtimeMetrics = resilientOperation.getRuntimeMetrics();
                if (runtimeMetrics) {
                    metadata.retries = runtimeMetrics.retries;
                    metadata.rateLimiting = { ...metadata.rateLimiting, ...runtimeMetrics.rateLimiting };
                    metadata.circuitBreaker = runtimeMetrics.circuitBreaker;
                    metadata.cache = { enabled: llmOptions?.enableCache ?? true, ...runtimeMetrics.cache };
                    metadata.timing.rateLimitWaitMs = runtimeMetrics.rateLimiting?.totalWaitMs ?? 0;
                }
                metadata.timing.totalTimeMs = Date.now() - startTime;
                const usageData = data?.usage && typeof data.usage === 'object' ? data.usage : {};
                const pt = usageData.prompt_tokens;
                const ct = usageData.completion_tokens;
                const tot = usageData.total_tokens ?? (pt != null && ct != null ? pt + ct : null);
                metadata.usage = {
                    prompt_tokens: pt ?? null,
                    completion_tokens: ct ?? null,
                    total_tokens: tot,
                };
                return { content, metadata };
            }
            return content;
        } catch (error) {
            console.error(`Error calling ${aiService} API:`, error);
            return this.parseError(null, error)
        }
    }
    
    /**
     * Retry the chat with an alternate service
     * @param {Array} conversationHistory - The conversation history
     * @param {Object} llmOptions - The LLM options
     * @returns {Promise<string>} - The response from the LLM
     */
    async retryChatWithAlternateService(conversationHistory, llmOptions = {}){
        this.llmOutOfService = this.llmOutOfService || [];
        // Track the current service that failed, not the original service
        const currentService = llmOptions?.aiService || this.aiService;
        this.llmOutOfService.push(currentService);
        const defaultModels = ProviderRegistry.getDefaultModels();
        for (const [providerName, model] of Object.entries(defaultModels)) {
            // Provider names from getDefaultModels() are normalized
            if (!this.llmOutOfService.includes(providerName)) {
                console.log("Switching LLM service to:", providerName, model);
                let newLLMOptions = Object.assign(llmOptions, {
                    aiService: providerName,
                    model: model
                });
                return this.chat(conversationHistory, newLLMOptions);
            }
        }
        throw new Error("No alternative model found");
    }

    /**
     * Simple HTTP client for making API requests
     * @param {string} apiUrl
     * @param {Object} requestBody
     * @param {Object} headers
     * @param {AbortSignal} abortSignal - Signal from ResilientOperation for timeout/cancellation
     * @param {Object} [observabilityOptions] - Optional observability context for metadata capture
     * @returns {Promise<{data: any, statusCode: number}>}
     */
    async _makeHttpRequest(apiUrl, requestBody, headers, abortSignal, observabilityOptions) {
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

            const data = await response?.json();

            // Create response object
            const result = { data, statusCode: response?.status };

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
                ResilientLLM._captureHttpMetadata(observabilityOptions.metadata, apiUrl, null, httpDurationMs, error);
            }
            
            if (error.name === 'AbortError') {
                console.error(`Request to ${apiUrl} timed out or was cancelled`);
            }
            console.error(`Error in request to ${apiUrl}:`, error);
            throw error;
        }
    }

    static _safeHeaderPrefixes = ['x-ratelimit', 'rate-limit', 'retry-after', 'x-request-id', 'request-id'];

    /**
     * Extract sanitized HTTP metadata from a response (no API keys or credentials).
     * @param {Object} metadata - The metadata object to populate
     * @param {string} apiUrl - The request URL
     * @param {Response|null} response - The fetch Response object
     * @param {number} durationMs - Time the HTTP request took
     * @param {Error} [error] - If the request threw an error
     * @private
     */
    static _captureHttpMetadata(metadata, apiUrl, response, durationMs, error) {
        let sanitizedUrl;
        try {
            const parsed = new URL(apiUrl);
            parsed.search = '';
            sanitizedUrl = parsed.toString();
        } catch {
            sanitizedUrl = apiUrl;
        }

        const safeHeaders = {};
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
        metadata.timing.httpRequestMs = durationMs;
    }

    /**
     * Parse errors from various LLM APIs to create uniform error communication
     * @param {number|null} statusCode - HTTP status code or null for general errors
     * @param {Error|Object|null} error - Error object
     * @reference https://platform.openai.com/docs/guides/error-codes/api-error-codes
     * @reference https://docs.anthropic.com/en/api/errors
     */
    parseError(statusCode, error){
        switch(statusCode){
            case 400:
                console.error("Bad request");
                throw new Error(error?.message || "Bad request");
            case 401:
                console.error("Invalid API Key");
                throw new Error(error?.message || "Invalid API Key");
            case 403:
                throw new Error(error?.message || "You are not authorized to access this resource");
            case 429:
                throw new Error(error?.message || "Rate limit exceeded");
            case 404:
                throw new Error(error?.message || "Not found");
            case 500:
                throw new Error(error?.message || "Internal server error");
            case 503:
                throw new Error(error?.message || "Service unavailable");
            case 529:
                throw new Error(error?.message || "API temporarily overloaded");
            default:
                throw new Error(error?.message || "Unknown error");
        }
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
    formatMessageForAnthropic(messages){
        let system;
        let messagesWithoutSystemMessage = [];
        for(let i = 0; i < messages.length; i++){
            if(messages[i].role === "system" && messages[i].content){
                system = messages[i].content;
            }else{
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
    _analyzeFinishReason(data) {
        if (!data) return null;

        const choice = data?.choices?.[0];
        const finishReason = choice?.finish_reason ?? null;
        const usage = data?.usage || {};
        const hasPromptTokens = usage?.prompt_tokens != null;
        const hasCompletionTokens = usage?.completion_tokens != null;
        const promptTokens = hasPromptTokens ? usage.prompt_tokens : null;
        const completionTokens = hasCompletionTokens ? usage.completion_tokens : null;
        const totalTokens =
            usage?.total_tokens ??
            ((hasPromptTokens && hasCompletionTokens)
                ? promptTokens + completionTokens
                : null);

        let summary = "";
        let recommendation = "";
        let tokensInfo = "";

        // When we make a recommendation about max_tokens, base it off what was just hit
        let calculatedRecommendedMax =
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
                    // Only mention tokens facts that we know
                    const tokenParts = [];
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

        // Humanize tokens info for all cases
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
            tokensInfo = ""; // Explicitly empty if no info
        }

        return { summary, tokensInfo, recommendation };
    }

    /**
     * Generic method to parse chat completion response using provider configuration
     * @param {Object} data - Response data from API
     * @param {Object} chatConfig - Chat configuration from provider
     * @param {boolean|Array} tools - Whether tools are enabled or tool definitions
     * @returns {string|Object} Parsed content or object with content and toolCalls
     */
    parseChatCompletion(data, chatConfig, tools) {
        if (!data) {
            return null;
        }
        
        const parsePath = chatConfig?.responseParsePath || 'choices[0].message.content';
        const content = this._getNestedValue(data, parsePath);
        
        // If tools are enabled, also extract tool_calls if available
        if (tools) {
            // Try to find tool_calls in common locations
            const toolCalls = data?.choices?.[0]?.message?.tool_calls || 
                             data?.content?.[0]?.tool_use ||
                             null;
            // Only return object if there are actual tool calls
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
    _getNestedValue(obj, path) {
        if (!path || !obj) return null;
        
        // Handle bracket notation like 'choices[0].message.content'
        const parts = path.split(/[\.\[\]]+/).filter(p => p);
        let current = obj;
        
        for (const part of parts) {
            if (current == null) {
                return null;
            }
            
            // Check if current is an array and part is a numeric index
            const index = parseInt(part, 10);
            if (!isNaN(index) && Array.isArray(current) && index >= 0 && index < current.length) {
                current = current[index];
            } else if (current && typeof current === 'object' && part in current) {
                // Try as property
                current = current[part];
            } else {
                return null;
            }
        }
        
        return current;
    }

    /**
     * Parse OpenAI chat completion response
     * @param {Object} data - Response data
     * @param {boolean|Array} tools - Whether tools are enabled
     * @returns {string|Object} Parsed content
     * @deprecated Use parseChatCompletion with chatConfig instead
     */
    parseOpenAIChatCompletion(data, tools){
        if(tools){
            return { content: data?.choices?.[0]?.message?.content, toolCalls: data?.choices?.[0]?.message?.tool_calls };
        }
        return data?.choices?.[0]?.message?.content;
    }

    /**
     * Parse Anthropic chat completion response
     * @param {Object} data - Response data
     * @param {boolean|Array} tools - Whether tools are enabled
     * @returns {string|Object} Parsed content
     * @deprecated Use parseChatCompletion with chatConfig instead
     */
    parseAnthropicChatCompletion(data, tools){
        return data?.content?.[0]?.text;
    }

    /**
     * Parse Ollama chat completion response
     * @param {Object} data - Response data
     * @param {boolean|Array} tools - Whether tools are enabled
     * @returns {string|Object} Parsed content
     * @deprecated Use parseChatCompletion with chatConfig instead
     */
    parseOllamaChatCompletion(data, tools){
        return data?.response;
    }

    /**
     * Parse Google chat completion response
     * @param {Object} data - Response data
     * @param {boolean|Array} tools - Whether tools are enabled
     * @returns {string|Object} Parsed content
     * @deprecated Use parseChatCompletion with chatConfig instead
     */
    parseGoogleChatCompletion(data, tools){
        // Assuming we're calling OpenAI compatible endpoint https://ai.google.dev/gemini-api/docs/openai
        return data?.choices?.[0]?.message?.content;
    }

    /**
     * Abort all ongoing LLM operations for this instance
     */
    abort(){
        this._abortController?.abort();
        this._abortController = null;
        this.resilientOperations = {};
    }

    /**
     * Estimate the number of tokens in a text
     * @param {string} text
     * @returns {number}
     */
    static estimateTokens(text){
        // For very large texts, the tokenizer is too slow, so use a faster approximation
        if (text.length > 10000) {
            // Rough approximation: ~4 characters per token for English text
            return Math.ceil(text.length / 4);
        }
        
        // For smaller texts, use accurate tokenization
        if (!ResilientLLM.encoder) {
            ResilientLLM.encoder = new Tiktoken(o200k_base);
        }
        return ResilientLLM.encoder.encode(text).length;
    }
}
export default ResilientLLM;