# Reference

Complete technical reference for the ResilientLLM library API.

## Table of Contents

- [ResilientLLM](#resilientllm)
  - [Constructor](#resilientllm-constructor)
  - [Static Properties](#resilientllm-static-properties)
  - [Instance Methods](#resilientllm-instance-methods)
  - [Static Methods](#resilientllm-static-methods)
- [Types and Interfaces](#types-and-interfaces)
- [Error Codes](#error-codes)
- [Environment Variables](#environment-variables)

---

## ResilientLLM

A unified interface for interacting with multiple LLM providers (OpenAI, Anthropic, Google/Gemini, Ollama) with built-in resilience features including rate limiting, retries, circuit breakers, and error handling.

### ResilientLLM Constructor

Creates a new `ResilientLLM` instance.

**Signature:**
```typescript
new ResilientLLM(options?: ResilientLLMOptions)
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `options` | `ResilientLLMOptions` | No | `{}` | Configuration options for the ResilientLLM instance |

**ResilientLLMOptions:**

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `aiService` | `string` | No | `process.env.PREFERRED_AI_SERVICE` or `"anthropic"` | AI service provider: `"openai"`, `"anthropic"`, `"google"`, or `"ollama"` |
| `model` | `string` | No | `process.env.PREFERRED_AI_MODEL` or `"claude-3-5-sonnet-20240620"` | Model identifier for the selected AI service |
| `temperature` | `number` | No | `process.env.AI_TEMPERATURE` or `0` | Temperature parameter (0-2) controlling randomness in responses |
| `maxTokens` | `number` | No | `process.env.MAX_TOKENS` or `2048` | Maximum number of tokens in the response |
| `timeout` | `number` | No | `process.env.LLM_TIMEOUT` or `60000` | Request timeout in milliseconds |
| `cacheStore` | `Object` | No | `{}` | Cache store object for storing successful responses |
| `maxInputTokens` | `number` | No | `process.env.MAX_INPUT_TOKENS` or `100000` | Maximum number of input tokens allowed |
| `topP` | `number` | No | `process.env.AI_TOP_P` or `0.95` | Top-p sampling parameter (0-1) |
| `rateLimitConfig` | `RateLimitConfig` | No | `{ requestsPerMinute: 10, llmTokensPerMinute: 150000 }` | Rate limiting configuration |
| `retries` | `number` | No | `3` | Number of retry attempts for failed requests |
| `backoffFactor` | `number` | No | `2` | Exponential backoff multiplier between retries |
| `onRateLimitUpdate` | `Function` | No | `undefined` | Callback function called when rate limit information is updated |
| `onError` | `Function` | No | `undefined` | Currently not used (reserved for future use) |

**RateLimitConfig:**

| Property | Type | Description |
|----------|------|-------------|
| `requestsPerMinute` | `number` | Maximum number of requests allowed per minute |
| `llmTokensPerMinute` | `number` | Maximum number of LLM tokens allowed per minute |

**Returns:** `ResilientLLM` instance

**Example:**
```javascript
const llm = new ResilientLLM({
  aiService: 'openai',
  model: 'gpt-4o-mini',
  maxTokens: 2048,
  temperature: 0.7,
  rateLimitConfig: {
    requestsPerMinute: 60,
    llmTokensPerMinute: 90000
  }
});
```

---

### ResilientLLM Static Properties

_No static properties currently available. Use `ProviderRegistry.getDefaultModels()` to get default models for all providers._

---

### ResilientLLM Instance Methods

#### `chat(conversationHistory, llmOptions?)`

Sends a chat completion request to the configured LLM provider.

**Signature:**
```typescript
chat(conversationHistory: Message[], llmOptions?: ChatOptions): Promise<string | ChatResponse>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationHistory` | `Message[]` | Yes | Array of message objects representing the conversation history |
| `llmOptions` | `ChatOptions` | No | Override options for this specific request |

**Message:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `role` | `string` | Yes | Message role: `"system"`, `"user"`, `"assistant"`, or `"tool"` |
| `content` | `string` | Yes | Message content |

**ChatOptions:**

| Property | Type | Description |
|----------|------|-------------|
| `aiService` | `string` | Override AI service for this request |
| `model` | `string` | Override model for this request |
| `maxTokens` | `number` | Override max tokens for this request |
| `temperature` | `number` | Override temperature for this request |
| `topP` | `number` | Override top-p for this request |
| `maxInputTokens` | `number` | Override max input tokens for this request |
| `maxCompletionTokens` | `number` | Maximum completion tokens (for reasoning models) |
| `reasoningEffort` | `string` | Reasoning effort level: `"low"`, `"medium"`, or `"high"` (for reasoning models) |
| `apiKey` | `string` | Override API key for this request (takes precedence over ProviderRegistry) |
| `tools` | `Tool[]` | Array of tool definitions for function calling |
| `responseFormat` | `Object` | Response format specification (e.g., `{ type: "json_object" }`) |

**Tool:**

| Property | Type | Description |
|----------|------|-------------|
| `type` | `string` | Tool type, typically `"function"` |
| `function` | `Object` | Function definition |
| `function.name` | `string` | Function name |
| `function.description` | `string` | Function description |
| `function.parameters` | `Object` | Function parameters schema (OpenAI format) |
| `function.input_schema` | `Object` | Function input schema (Anthropic format) |

**Returns:** `Promise<string | ChatResponse>`

- If `tools` are provided: Returns `ChatResponse` object with `content` and `toolCalls` properties
- Otherwise: Returns `string` containing the assistant's response

**ChatResponse:**

| Property | Type | Description |
|----------|------|-------------|
| `content` | `string \| null` | The text content of the response |
| `toolCalls` | `Array` | Array of tool call objects (if tools were used) |

**Throws:**

- `Error` - If input tokens exceed `maxInputTokens`
- `Error` - If API key is not set for the selected service (unless auth is optional)
- `Error` - If the AI service/provider is invalid
- `Error` - If API request fails

**Notes:**

- API keys can be provided via `llmOptions.apiKey`, `ProviderRegistry.configure()`, or environment variables
- The implementation uses `ProviderRegistry` to manage providers and their configurations
- Response parsing is handled generically using provider-specific `chatConfig` settings

**Example:**
```javascript
const conversationHistory = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the capital of France?' }
];

const response = await llm.chat(conversationHistory);
console.log(response); // "The capital of France is Paris."
```

**Example with tools:**
```javascript
const response = await llm.chat(conversationHistory, {
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        }
      }
    }
  }]
});
// response: { content: null, toolCalls: [...] }
```

**Example with API key override:**
```javascript
// Override API key for this specific request
const response = await llm.chat(conversationHistory, {
  apiKey: 'sk-custom-key-here',
  aiService: 'openai',
  model: 'gpt-4o-mini'
});
```

---

#### `abort()`

Cancels all ongoing LLM operations for this instance.

**Signature:**
```typescript
abort(): void
```

**Returns:** `void`

**Description:**
- Aborts all active HTTP requests initiated by this `ResilientLLM` instance
- Clears all resilient operation instances
- Resets the internal abort controller

**Example:**
```javascript
const promise = llm.chat(conversationHistory);
llm.abort(); // Cancels the ongoing request
```

---

**Note:** API URLs and keys are managed through `ProviderRegistry`. Use `ProviderRegistry.getChatApiUrl(providerName)` and `ProviderRegistry.getApiKey(providerName)` to access these values. See [Custom Provider Guide](./custom-providers.md) for details.

---

#### `formatMessageForAnthropic(messages)`

Converts a messages array to the format required by Anthropic's API.

**Signature:**
```typescript
formatMessageForAnthropic(messages: Message[]): { system?: string, messages: Message[] }
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `messages` | `Message[]` | Yes | Array of message objects |

**Returns:** `Object` with properties:
- `system` - `string | undefined` - System message content if present
- `messages` - `Message[]` - Messages array without system messages

**Description:**
- Extracts system messages from the messages array
- Returns system content separately and remaining messages without system role

**Example:**
```javascript
const messages = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' }
];

const { system, messages } = llm.formatMessageForAnthropic(messages);
// system: "You are helpful."
// messages: [{ role: 'user', content: 'Hello!' }]
```

---

#### `parseError(statusCode, error)`

Parses errors from various LLM APIs to create uniform error messages. This method is called internally when errors occur.

**Signature:**
```typescript
parseError(statusCode: number | null, error: Error | Object | null): never
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `statusCode` | `number \| null` | Yes | HTTP status code or null for general errors |
| `error` | `Error \| Object \| null` | Yes | Error object |

**Returns:** `never` - Always throws an error

**Throws:** `Error` with appropriate message based on status code

**Status Code Mappings:**

| Status Code | Error Message |
|------------|---------------|
| `400` | "Bad request" |
| `401` | "Invalid API Key" |
| `403` | "You are not authorized to access this resource" |
| `404` | "Not found" |
| `429` | "Rate limit exceeded" |
| `500` | "Internal server error" |
| `503` | "Service unavailable" |
| `529` | "API temporarily overloaded" |
| Other | "Unknown error" |

**Note:** This method is called internally by the `chat()` method when errors occur. You typically don't need to call it directly.

---

#### `parseChatCompletion(data, chatConfig, tools?)`

Generic method to parse chat completion response using provider configuration. This is the preferred method used internally.

**Signature:**
```typescript
parseChatCompletion(data: Object, chatConfig: Object, tools?: Tool[]): string | ChatResponse
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Object` | Yes | API response object |
| `chatConfig` | `Object` | Yes | Chat configuration from provider (contains `responseParsePath`) |
| `tools` | `Tool[]` | No | Tools array if function calling was used |

**Returns:** `string | ChatResponse`
- If `tools` provided and tool calls found: Returns `ChatResponse` with `content` and `toolCalls`
- Otherwise: Returns `string` content

**chatConfig.responseParsePath:**
- Path to extract content from response (e.g., `'choices[0].message.content'`, `'content[0].text'`, `'response'`)
- Supports dot notation and bracket notation for nested values

**Example:**
```javascript
const chatConfig = {
  responseParsePath: 'choices[0].message.content',
  toolSchemaType: 'openai'
};
const data = {
  choices: [{
    message: {
      content: "Hello!",
      tool_calls: []
    }
  }]
};
const content = llm.parseChatCompletion(data, chatConfig);
// "Hello!"
```

---

#### `parseOpenAIChatCompletion(data, tools?)` (Deprecated)

Parses OpenAI chat completion response.

**Signature:**
```typescript
parseOpenAIChatCompletion(data: Object, tools?: Tool[]): string | ChatResponse
```

**Status:** ⚠️ Deprecated - Use `parseChatCompletion()` with `chatConfig` instead.

---

#### `parseAnthropicChatCompletion(data, tools?)` (Deprecated)

Parses Anthropic chat completion response.

**Signature:**
```typescript
parseAnthropicChatCompletion(data: Object, tools?: Tool[]): string
```

**Status:** ⚠️ Deprecated - Use `parseChatCompletion()` with `chatConfig` instead.

---

#### `parseOllamaChatCompletion(data, tools?)` (Deprecated)

Parses Ollama chat completion response.

**Signature:**
```typescript
parseOllamaChatCompletion(data: Object, tools?: Tool[]): string
```

**Status:** ⚠️ Deprecated - Use `parseChatCompletion()` with `chatConfig` instead.

---

#### `parseGoogleChatCompletion(data, tools?)` (Deprecated)

Parses Google chat completion response (OpenAI-compatible endpoint).

**Signature:**
```typescript
parseGoogleChatCompletion(data: Object, tools?: Tool[]): string
```

**Status:** ⚠️ Deprecated - Use `parseChatCompletion()` with `chatConfig` instead.

---

#### `retryChatWithAlternateService(conversationHistory, llmOptions?)`

Retries the chat request with an alternate AI service when the current service returns rate limit errors (429, 529).

**Signature:**
```typescript
retryChatWithAlternateService(conversationHistory: Message[], llmOptions?: ChatOptions): Promise<string | ChatResponse>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationHistory` | `Message[]` | Yes | Array of message objects |
| `llmOptions` | `ChatOptions` | No | LLM options for the request |

**Returns:** `Promise<string | ChatResponse>` - Response from the alternate service

**Throws:**

- `Error` - If no alternative service is available

**Description:**
- Automatically switches to the next available service from `ProviderRegistry.getDefaultModels()`
- Skips services that have already failed
- Uses default model for each service

**Example:**
```javascript
// Automatically called internally when rate limit errors occur
// Can also be called manually if needed
const response = await llm.retryChatWithAlternateService(conversationHistory);
```

---

### ResilientLLM Static Methods

#### `estimateTokens(text)`

Estimates the number of tokens in a given text string.

**Signature:**
```typescript
static estimateTokens(text: string): number
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | `string` | Yes | Text to estimate tokens for |

**Returns:** `number` - Estimated token count

**Description:**
- For texts longer than 10,000 characters: Uses approximation (~4 characters per token)
- For shorter texts: Uses accurate tokenization with Tiktoken encoder (o200k_base encoding)
- Uses lazy initialization of the encoder

**Example:**
```javascript
const tokenCount = ResilientLLM.estimateTokens("Hello, world!");
// Returns estimated token count
```

---

## Types and Interfaces

### Message

Represents a single message in a conversation.

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}
```

### ChatResponse

Response object when tools are provided.

```typescript
interface ChatResponse {
  content: string | null;
  toolCalls?: Array<any>;
}
```

### RateLimitConfig

Configuration for rate limiting.

```typescript
interface RateLimitConfig {
  requestsPerMinute: number;
  llmTokensPerMinute: number;
}
```

### ResilientLLMOptions

Constructor options for ResilientLLM.

```typescript
interface ResilientLLMOptions {
  aiService?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  cacheStore?: Object;
  maxInputTokens?: number;
  topP?: number;
  rateLimitConfig?: RateLimitConfig;
  retries?: number;
  backoffFactor?: number;
  onRateLimitUpdate?: (info: RateLimitInfo) => void;
  onError?: (error: Error) => void;
}
```

### ChatOptions

Options for individual chat requests.

```typescript
interface ChatOptions {
  aiService?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  maxInputTokens?: number;
  maxCompletionTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  apiKey?: string;
  tools?: Tool[];
  responseFormat?: Object;
}
```

### Tool

Tool definition for function calling.

```typescript
interface Tool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters?: Object;  // OpenAI format
    input_schema?: Object; // Anthropic format
  };
}
```

---

## Error Codes

### HTTP Status Codes

| Code | Meaning | Behavior |
|------|---------|----------|
| `200` | Success | Returns parsed response |
| `400` | Bad Request | Throws error |
| `401` | Unauthorized | Throws "Invalid API Key" error |
| `403` | Forbidden | Throws authorization error |
| `404` | Not Found | Throws "Not found" error |
| `429` | Rate Limit Exceeded | Triggers retry with alternate service |
| `500` | Internal Server Error | Retries with backoff |
| `503` | Service Unavailable | Retries with backoff |
| `529` | API Overloaded | Triggers retry with alternate service |

### Error Types

| Error Name | Description | Retry Behavior |
|------------|-------------|----------------|
| `AbortError` | Operation was aborted | No retry |
| `TimeoutError` | Operation timed out | Retries with backoff |
| `Error` (message: "Circuit breaker is open") | Circuit breaker is open | No retry until cooldown expires |

---

## Environment Variables

### API Key Configuration

API keys are required for most LLM providers. They can be provided in three ways (in order of precedence):

1. Per-request via `llmOptions.apiKey` (highest priority)
2. Via [`ProviderRegistry.configure()`](./custom-providers.md#apikey-direct-in-providerregistry) with direct `apiKey` parameter
3. Via environment variables (lowest priority)

**For advanced use cases** (custom providers, multiple API keys, or programmatic configuration), see the [Custom Provider Guide - Authentication Configuration](./custom-providers.md#authentication-configuration).

### Required (Service-Specific)

Set at least one API key for your chosen service:

| Variable | Service | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI | Yes (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic | Yes (if using Anthropic) |
| `GOOGLE_API_KEY` or `GOOGLE_GENERATIVE_AI` or `GEMINI_API_KEY` | Google | Yes (if using Google) |
| `OLLAMA_API_KEY` | Ollama | No (optional) |

**Note:** For custom providers, use the environment variable names specified in `ProviderRegistry.configure()` via `envVarNames`.

### Optional Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PREFERRED_AI_SERVICE` | `"anthropic"` | Default AI service |
| `PREFERRED_AI_MODEL` | `"claude-3-5-sonnet-20240620"` | Default model |
| `AI_TEMPERATURE` | `0` | Default temperature |
| `MAX_TOKENS` | `2048` | Default max tokens |
| `LLM_TIMEOUT` | `60000` | Default timeout (ms) |
| `MAX_INPUT_TOKENS` | `100000` | Default max input tokens |
| `AI_TOP_P` | `0.95` | Default top-p value |
| `OLLAMA_API_URL` | `"http://localhost:11434/api/generate"` | Ollama API URL |
| `STORE_AI_API_CALLS` | `undefined` | Set to `"true"` to store API calls (OpenAI) |

---

## API Response Formats

### OpenAI Response

```json
{
  "id": "chatcmpl-123456",
  "object": "chat.completion",
  "created": 1728933352,
  "model": "gpt-4o-2024-08-06",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Response text",
      "tool_calls": []
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 10,
    "total_tokens": 29
  }
}
```

### Anthropic Response

```json
{
  "id": "msg_123",
  "type": "message",
  "role": "assistant",
  "content": [{
    "type": "text",
    "text": "Response text"
  }],
  "model": "claude-3-5-sonnet-20240620",
  "usage": {
    "input_tokens": 19,
    "output_tokens": 10
  }
}
```

### Gemini Response (OpenAI-Compatible)

Same format as OpenAI response.

### Ollama Response

```json
{
  "model": "llama3.1:8b",
  "created_at": "2024-01-01T00:00:00.000Z",
  "response": "Response text",
  "done": true,
  "context": [],
  "total_duration": 1000,
  "load_duration": 500,
  "prompt_eval_count": 10,
  "prompt_eval_duration": 200,
  "eval_count": 20,
  "eval_duration": 300
}
```

---

## Supported Models

### Default Models

Each service has a default model configured. Use `ProviderRegistry.getDefaultModels()` to get all default models:

- **Anthropic:** `claude-3-5-sonnet-20240620`
- **OpenAI:** `gpt-4o-mini`
- **Google:** `gemini-2.0-flash`
- **Ollama:** `llama3.1:8b`

### Reasoning Models

Models starting with `"o"` (e.g., `"o1"`, `"o3"`) or `"gpt-5"` are treated as reasoning models and use different parameters:

- `max_completion_tokens` instead of `max_tokens`
- `reasoning_effort` parameter (`"low"`, `"medium"`, `"high"`, defaults to `"medium"`)
- No `temperature` or `top_p` parameters

---

## Rate Limiting Behavior

### Token Bucket Algorithm

The library uses a token bucket algorithm with two buckets:

1. **Request Bucket:** Limits requests per minute
2. **LLM Token Bucket:** Limits LLM tokens per minute

### Dynamic Updates

Rate limits can be updated dynamically from API response headers:

- `retry-after` header is respected
- Rate limit information from responses updates buckets automatically
- `onRateLimitUpdate` callback is invoked when limits change

### Circuit Breaker Integration

- Each retry attempt counts as a separate failure
- Circuit opens after configured failure threshold
- Cooldown period prevents immediate retries
- Success resets the failure count

---

## Caching

### Cache Store

Provide a cache store object in constructor options:

```javascript
const cacheStore = {};
const llm = new ResilientLLM({ cacheStore });
```

### Cache Key Generation

Cache keys are SHA-256 hashes of:
- API URL
- Request body (JSON stringified)
- Headers (JSON stringified)

### Cache Behavior

- Only successful responses (status 200) are cached
- Cache is checked before making HTTP requests
- Cache hits return immediately without API call

---

## AbortController Support

### Cancellation

Use `abort()` method to cancel all ongoing operations:

```javascript
const llm = new ResilientLLM({ /* ... */ });
const promise = llm.chat(conversationHistory);
llm.abort(); // Cancels the request
```

### Timeout

Timeouts are enforced using `AbortController`:

- Timeout applies to entire operation (including retries)
- On timeout, `AbortController` aborts the HTTP request
- Throws `TimeoutError` if operation exceeds timeout

---

## Service-Specific Notes

### Provider Management

All providers are managed through `ProviderRegistry`. The implementation uses:

- `ProviderRegistry.get(providerName)` - Get provider configuration
- `ProviderRegistry.getChatApiUrl(providerName)` - Get chat API URL
- `ProviderRegistry.getChatConfig(providerName)` - Get chat configuration
- `ProviderRegistry.buildApiUrl(providerName, url)` - Build API URL with query params if needed
- `ProviderRegistry.buildAuthHeaders(providerName, apiKey, defaultHeaders)` - Build authentication headers
- `ProviderRegistry.hasApiKey(providerName)` - Check if API key is available

See [Custom Provider Guide](./custom-providers.md) for details on configuring providers.

### Anthropic

- System messages are extracted and sent separately
- Tool definitions use `input_schema` instead of `parameters`
- API version header: `anthropic-version: 2023-06-01`
- Uses `x-api-key` header instead of `Authorization`

### OpenAI

- Supports function calling with `tools` parameter
- Supports `response_format` for JSON mode
- Uses standard `Authorization: Bearer <token>` header
- Can store API calls if `STORE_AI_API_CALLS=true`

### Google

- Uses OpenAI-compatible endpoint
- Same format as OpenAI for requests/responses
- Requires `GEMINI_API_KEY` environment variable

### Ollama

- Defaults to `http://localhost:11434/api/generate`
- Can override with `OLLAMA_API_URL` environment variable
- API key is optional
- Uses different response format

