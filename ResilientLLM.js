/**
 * A common interface to interact with AI models
 * @example
 * const llm = new LLM({ aiService: "anthropic", model: "claude-3-5-sonnet-20240620", maxTokens: 2048, temperature: 0 });
 * const response = await llm.chat([{ role: "user", content: "Hello, world!" }]);
 * console.log(response);
 * // You may cancel all llm operations (for the given instance) by calling abort() method on the ResilientLLM instance
 * llm.abort();
 */
import { Tiktoken } from "js-tiktoken/lite";
import o200k_base from "js-tiktoken/ranks/o200k_base";
import ResilientOperation from "./ResilientOperation.js";

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
 * @param {Function} options.onRateLimitUpdate - The function to call when the rate limit is updated
 * @example
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
    static DEFAULT_MODELS = {
        anthropic: "claude-3-5-sonnet-20240620",
        openai: "gpt-4o-mini",
        gemini: "gemini-2.0-flash",
        ollama: "llama3.1:8b"
    }

    constructor(options) {
        this.aiService = options?.aiService || process.env.PREFERRED_AI_SERVICE || "anthropic"; // e.g. openai, anthropic, ollama, etc.
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
     * Get the API URL for the given AI service
     * @param {string} aiService - The AI service to use
     * @returns {string} - The API URL for the given AI service
     */
    getApiUrl(aiService) {
        let apiUrl = null;
        if (aiService === 'openai') {
            apiUrl = "https://api.openai.com/v1/chat/completions";
        } else if (aiService === 'anthropic') {
            apiUrl = "https://api.anthropic.com/v1/messages";
        } else if (aiService === 'ollama') {
            apiUrl = process.env.OLLAMA_API_URL || "http://localhost:11434/api/generate";
        } else if (aiService === 'gemini') {
            apiUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
        } else {
            throw new Error('Invalid AI service specified. Use "openai", "anthropic", "ollama", or "gemini".');
        }
        return apiUrl;
    }

    /**
     * Get the API key for the given AI service
     * @param {string} aiService - The AI service to use
     * @returns {string} - The API key for the given AI service
     */
    getApiKey(aiService) {
        let apiKey = null;
        if (aiService === 'openai') {
            apiKey = process.env.OPENAI_API_KEY;
            if(!apiKey) throw new Error("OPENAI_API_KEY is not set");
        } else if (aiService === 'anthropic') {
            apiKey = process.env.ANTHROPIC_API_KEY;
            if(!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
        } else if (aiService === 'ollama') {
            apiKey = process.env.OLLAMA_API_KEY;
        } else if (aiService === 'gemini') {
            apiKey = process.env.GEMINI_API_KEY;
            if(!apiKey) throw new Error("GEMINI_API_KEY is not set");
        } else {
            throw new Error('Invalid AI service specified. Use "openai", "anthropic", "ollama", or "gemini".');
        }
        return apiKey;
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
        const apiUrl = this.getApiUrl(aiService);
        const apiKey = this.getApiKey(aiService);
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
        if(requestBody.model?.startsWith("o")){
            // Reasoning model parameters
            requestBody.max_completion_tokens = Number(llmOptions?.maxCompletionTokens || this.maxCompletionTokens || llmOptions?.maxTokens || this.maxTokens);
            requestBody.reasoning_effort = llmOptions?.reasoningEffort || this.reasoningEffort || "medium";
        } else {
            requestBody.max_tokens = Number(llmOptions?.maxTokens || this.maxTokens);
            requestBody.temperature = Number(llmOptions?.temperature || this.temperature);
            requestBody.top_p = Number(llmOptions?.topP || this.topP || 0.95);
        }
        if (aiService === 'anthropic') {
            if(!apiKey) throw new Error("Anthropic API key is not set");
            const { system, messages } = this.formatMessageForAnthropic(conversationHistory);
            if(system) requestBody.system = system;
            requestBody.messages = messages;
            if(requestBody.tools?.length){
                // Change the tool definitions to Anthropic supported tool use schema
                let toolDefinitions = JSON.parse(JSON.stringify(requestBody.tools));
                for(let tool of toolDefinitions){
                    if(!tool.function.input_schema && tool.function.parameters){
                        tool.function.input_schema = tool.function.parameters;
                        delete tool.function.parameters;
                    }
                }
                requestBody.tools = toolDefinitions;
            }
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': `${apiKey}`,
                'anthropic-version': '2023-06-01',
            };
        } else if (aiService === 'openai' || aiService === 'ollama' || aiService === 'gemini') {
            requestBody.messages = conversationHistory;
            if(process.env.STORE_AI_API_CALLS === 'true'){
                requestBody.store = true;
            }
            if(requestBody.tools?.length){
                // Change the tool definitions to OpenAI supported tool use schema
                let toolDefinitions = JSON.parse(JSON.stringify(requestBody.tools));
                for(let tool of toolDefinitions){
                    if(!tool.function.parameters && tool.function.input_schema){
                        tool.function.parameters = tool.function.input_schema;
                        delete tool.function.input_schema;
                    }
                }
                requestBody.tools = toolDefinitions;
            }
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            };
        } else {
            throw new Error('Invalid provider specified. Use "anthropic" or "openai" or "gemini" or "ollama".');
        }
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
            let content = null;
            switch(aiService){
                case 'anthropic':
                    content = this.parseAnthropicChatCompletion(data, llmOptions?.tools);
                    break;
                case 'openai':
                    content = this.parseOpenAIChatCompletion(data, llmOptions?.tools);
                    break;
                case 'gemini':
                    content = this.parseGeminiChatCompletion(data, llmOptions?.tools);
                    break;
                case 'ollama':
                    content = this.parseOllamaChatCompletion(data, llmOptions?.tools);
                    break;
            }
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
        console.log("LLM out of service:", llmOptions.aiService || this.aiService);
        this.llmOutOfService = this.llmOutOfService || [];
        this.llmOutOfService.push(llmOptions.aiService || this.aiService);
        for(let aiService in ResilientLLM.DEFAULT_MODELS){
            if(!this.llmOutOfService.includes(aiService)){
                console.log("Switching LLM service to:", aiService, ResilientLLM.DEFAULT_MODELS[aiService]);
                let newLLMOptions = Object.assign(llmOptions, {
                    aiService: aiService,
                    model: ResilientLLM.DEFAULT_MODELS[aiService]
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
     * @param {Array} messages
     * @returns {Object}
     * @example 
     * const { system, messages } = AI.formatMessageForAnthropic(originalMessages);
     * // originalMessages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Hello, world!" }]
     * // system: { role: "system", content: "You are a helpful assistant." }
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
     * 
     * @param {*} data 
     * @returns 
     */
    parseOpenAIChatCompletion(data, tools){
        if(tools){
            return { content: data?.choices?.[0]?.message?.content, toolCalls: data?.choices?.[0]?.message?.tool_calls };
        }
        return data?.choices?.[0]?.message?.content;
    }

    /**
     * 
     * @param {*} data 
     * @returns 
     */
    parseAnthropicChatCompletion(data, tools){
        return data?.content?.[0]?.text;
    }

    /**
     * 
     * @param {*} data 
     * @returns 
     */
    parseOllamaChatCompletion(data, tools){
        return data?.response;
    }

    parseGeminiChatCompletion(data, tools){
        // Assuming we're calling OpenAI compatible endpoint https://ai.google.dev/gemini-api/docs/openai
        return data?.choices?.[0]?.message?.content;
    }

    abort(){
        this._abortController?.abort();
        this._abortController = null;
        this.resilientOperations = {};
        this._abortController = null;
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