/**
 * A common interface to interact with AI models
 * @example
 * import { ResilientLLM } from 'resilient-llm';
 * const llm = new ResilientLLM({ aiService: "anthropic", model: "claude-3-5-sonnet-20240620", maxTokens: 2048, temperature: 0 });
 * const response = await llm.chat([{ role: "user", content: "Hello, world!" }]);
 * console.log(response);
 * // You may cancel all llm operations (for the given instance) by calling abort() method on the ResilientLLM instance
 * llm.abort();
 */
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
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
 * @example
 * import { ResilientLLM } from 'resilient-llm';
 * const llm = new ResilientLLM({
 *   aiService: "anthropic",
 *   model: "claude-3-5-sonnet-20240620",
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
        this.model = options?.model || process.env.PREFERRED_AI_MODEL || "claude-3-5-sonnet-20240620";
        this.temperature = options?.temperature || process.env.AI_TEMPERATURE || 0;
        this.maxTokens = options?.maxTokens || process.env.MAX_TOKENS || 2048;
        this.timeout = options?.timeout || process.env.LLM_TIMEOUT || 60000;
        this.cacheStore = options?.cacheStore || {};
        this.maxInputTokens = options?.maxInputTokens || process.env.MAX_INPUT_TOKENS || 100000;
        this.topP = options?.topP || process.env.AI_TOP_P || 0.95;
        // Add rate limit config options if provided
        this.rateLimitConfig = options?.rateLimitConfig || { requestsPerMinute: 10, llmTokensPerMinute: 150000 };
        this.retries = options?.retries || 3;
        this.backoffFactor = options?.backoffFactor || 2;
        this.onRateLimitUpdate = options?.onRateLimitUpdate;
        this._abortController = null;
        this.resilientOperations = {}; // Store resilient operation instances for observability
    }


    /**
     * Chat with the LLM
     * @param {Array} conversationHistory - The conversation history
     * @param {Object} llmOptions - The LLM options
     * @returns {Promise<string>} - The response from the LLM
     */
    async chat(conversationHistory, llmOptions = {}) {
        //TODO: Support reasoning models, they have different parameters
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
        
        // Handle query parameter authentication (buildApiUrl handles this internally)
        apiUrl = ProviderRegistry.buildApiUrl(aiService, apiUrl);
        
        const maxInputTokens = llmOptions?.maxInputTokens || this.maxInputTokens;
        
        // Estimate LLM tokens for this request
        const estimatedLLMTokens = ResilientLLM.estimateTokens(conversationHistory?.map(message => message?.content)?.join("\n"));
        console.log("Estimated LLM input tokens:", estimatedLLMTokens);
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
            requestBody.max_completion_tokens = Number(llmOptions?.maxCompletionTokens || this.maxCompletionTokens || llmOptions?.maxTokens || this.maxTokens);
            requestBody.reasoning_effort = llmOptions?.reasoningEffort || this.reasoningEffort || "medium";
        } else {
            requestBody.max_tokens = Number(llmOptions?.maxTokens || this.maxTokens);
            requestBody.temperature = Number(llmOptions?.temperature || this.temperature);
            requestBody.top_p = Number(llmOptions?.topP || this.topP || 0.95);
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
        const defaultHeaders = {
            'Content-Type': 'application/json'
        };
        // Use API key from llmOptions if provided, otherwise let buildAuthHeaders retrieve it from registry
        const apiKey = llmOptions?.apiKey || null;
        headers = ProviderRegistry.buildAuthHeaders(aiService, apiKey, defaultHeaders);
        try{
            // Instantiate ResilientOperation for LLM calls
            const resilientOperation = new ResilientOperation({
                bucketId: this.aiService,
                rateLimitConfig: this.rateLimitConfig,
                retries: this.retries,
                timeout: this.timeout,
                backoffFactor: this.backoffFactor,
                onRateLimitUpdate: this.onRateLimitUpdate,
                cacheStore: this.cacheStore
            });
            // Use single instance of abort controller for all operations
            this._abortController = this._abortController || new AbortController();
            this.resilientOperations[resilientOperation.id] = resilientOperation;
            // Wrap the LLM API call in ResilientOperation for rate limiting, retries, etc.
            const { data, statusCode } = await resilientOperation
                .withTokens(estimatedLLMTokens)
                .withCache()
                .withAbortControl(this._abortController)
                .execute(this._makeHttpRequest, apiUrl, requestBody, headers, this._abortController.signal);
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
            delete this.resilientOperations[resilientOperation.id];
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
     * @returns {Promise<{data: any, statusCode: number}>}
     */
    async _makeHttpRequest(apiUrl, requestBody, headers, abortSignal) {
        console.log("Making HTTP request to:", apiUrl);
        console.log("You may cancel it by calling abort() method on the ResilientLLM instance");
        const startTime = Date.now();
        
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

            const totalTime = Date.now() - startTime;
            console.log(`Request to ${apiUrl} completed in ${totalTime} ms`);
            
            return result;
        } catch (error) {
            const totalTime = Date.now() - startTime; // Calculate total time taken
            console.log(`Request to ${apiUrl} failed in ${totalTime} ms`);
            
            if (error.name === 'AbortError') {
                console.error(`Request to ${apiUrl} timed out or was cancelled`);
            }
            console.error(`Error in request to ${apiUrl}:`, error);
            throw error;
        }
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
     * const llm = new ResilientLLM({ aiService: "anthropic", model: "claude-3-5-sonnet-20240620" });
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