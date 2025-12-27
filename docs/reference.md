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

A unified interface for interacting with multiple LLM providers (OpenAI, Anthropic, Google Gemini, Ollama) with built-in resilience features including rate limiting, retries, circuit breakers, and error handling.

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
| `aiService` | `string` | No | `process.env.PREFERRED_AI_SERVICE` or `"anthropic"` | AI service provider: `"openai"`, `"anthropic"`, `"gemini"`, or `"ollama"` |
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
| `onError` | `Function` | No | `undefined` | Callback function called when an error occurs |

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

#### `DEFAULT_MODELS`

Default model identifiers for each AI service provider.

**Type:** `Object<string, string>`

**Value:**
```javascript
{
  anthropic: "claude-3-5-sonnet-20240620",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.1:8b"
}
```

**Example:**
```javascript
const defaultModel = ResilientLLM.DEFAULT_MODELS.anthropic;
// "claude-3-5-sonnet-20240620"
```

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
- `Error` - If API key is not set for the selected service
- `Error` - If the AI service is invalid
- `Error` - If API request fails

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

#### `getApiUrl(aiService)`

Returns the API URL for the specified AI service.

**Signature:**
```typescript
getApiUrl(aiService: string): string
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `aiService` | `string` | Yes | AI service identifier: `"openai"`, `"anthropic"`, `"gemini"`, or `"ollama"` |

**Returns:** `string` - API URL for the service

**Throws:**

- `Error` - If the AI service is invalid

**Service URLs:**

| Service | URL |
|---------|-----|
| `"openai"` | `"https://api.openai.com/v1/chat/completions"` |
| `"anthropic"` | `"https://api.anthropic.com/v1/messages"` |
| `"gemini"` | `"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"` |
| `"ollama"` | `process.env.OLLAMA_API_URL` or `"http://localhost:11434/api/generate"` |

**Example:**
```javascript
const url = llm.getApiUrl('openai');
// "https://api.openai.com/v1/chat/completions"
```

---

#### `getApiKey(aiService)`

Returns the API key for the specified AI service from environment variables.

**Signature:**
```typescript
getApiKey(aiService: string): string
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `aiService` | `string` | Yes | AI service identifier: `"openai"`, `"anthropic"`, `"gemini"`, or `"ollama"` |

**Returns:** `string` - API key for the service

**Throws:**

- `Error` - If the AI service is invalid
- `Error` - If the required API key environment variable is not set (except for Ollama)

**Environment Variables:**

| Service | Environment Variable |
|---------|---------------------|
| `"openai"` | `OPENAI_API_KEY` |
| `"anthropic"` | `ANTHROPIC_API_KEY` |
| `"gemini"` | `GEMINI_API_KEY` |
| `"ollama"` | `OLLAMA_API_KEY` (optional) |

**Example:**
```javascript
const apiKey = llm.getApiKey('anthropic');
// Returns process.env.ANTHROPIC_API_KEY
```

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

Parses errors from various LLM APIs to create uniform error messages.

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

**Example:**
```javascript
try {
  await llm.chat(conversationHistory);
} catch (error) {
  llm.parseError(429, error); // Throws: "Rate limit exceeded"
}
```

---

#### `parseOpenAIChatCompletion(data, tools?)`

Parses OpenAI chat completion response.

**Signature:**
```typescript
parseOpenAIChatCompletion(data: Object, tools?: Tool[]): string | ChatResponse
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Object` | Yes | OpenAI API response object |
| `tools` | `Tool[]` | No | Tools array if function calling was used |

**Returns:** `string | ChatResponse`
- If `tools` provided: Returns `ChatResponse` with `content` and `toolCalls`
- Otherwise: Returns `string` content

**Example:**
```javascript
const data = {
  choices: [{
    message: {
      content: "Hello!",
      tool_calls: []
    }
  }]
};
const content = llm.parseOpenAIChatCompletion(data);
// "Hello!"
```

---

#### `parseAnthropicChatCompletion(data, tools?)`

Parses Anthropic chat completion response.

**Signature:**
```typescript
parseAnthropicChatCompletion(data: Object, tools?: Tool[]): string
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Object` | Yes | Anthropic API response object |
| `tools` | `Tool[]` | No | Unused, kept for API consistency |

**Returns:** `string` - Text content from the response

**Example:**
```javascript
const data = {
  content: [{
    text: "Hello!"
  }]
};
const content = llm.parseAnthropicChatCompletion(data);
// "Hello!"
```

---

#### `parseOllamaChatCompletion(data, tools?)`

Parses Ollama chat completion response.

**Signature:**
```typescript
parseOllamaChatCompletion(data: Object, tools?: Tool[]): string
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Object` | Yes | Ollama API response object |
| `tools` | `Tool[]` | No | Unused, kept for API consistency |

**Returns:** `string` - Response text

**Example:**
```javascript
const data = { response: "Hello!" };
const content = llm.parseOllamaChatCompletion(data);
// "Hello!"
```

---

#### `parseGeminiChatCompletion(data, tools?)`

Parses Google Gemini chat completion response (OpenAI-compatible endpoint).

**Signature:**
```typescript
parseGeminiChatCompletion(data: Object, tools?: Tool[]): string
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `data` | `Object` | Yes | Gemini API response object |
| `tools` | `Tool[]` | No | Unused, kept for API consistency |

**Returns:** `string` - Text content from the response

**Example:**
```javascript
const data = {
  choices: [{
    message: {
      content: "Hello!"
    }
  }]
};
const content = llm.parseGeminiChatCompletion(data);
// "Hello!"
```

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
- Automatically switches to the next available service from `DEFAULT_MODELS`
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

### Required (Service-Specific)

Set at least one API key for your chosen service:

| Variable | Service | Required |
|----------|---------|----------|
| `OPENAI_API_KEY` | OpenAI | Yes (if using OpenAI) |
| `ANTHROPIC_API_KEY` | Anthropic | Yes (if using Anthropic) |
| `GEMINI_API_KEY` | Google Gemini | Yes (if using Gemini) |
| `OLLAMA_API_KEY` | Ollama | No (optional) |

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

Each service has a default model configured in `ResilientLLM.DEFAULT_MODELS`:

- **Anthropic:** `claude-3-5-sonnet-20240620`
- **OpenAI:** `gpt-4o-mini`
- **Gemini:** `gemini-2.0-flash`
- **Ollama:** `llama3.1:8b`

### Reasoning Models

Models starting with `"o"` (e.g., `"o1"`, `"o3"`) are treated as reasoning models and use different parameters:

- `max_completion_tokens` instead of `max_tokens`
- `reasoning_effort` parameter (`"low"`, `"medium"`, `"high"`)
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

### Gemini

- Uses OpenAI-compatible endpoint
- Same format as OpenAI for requests/responses
- Requires `GEMINI_API_KEY` environment variable

### Ollama

- Defaults to `http://localhost:11434/api/generate`
- Can override with `OLLAMA_API_URL` environment variable
- API key is optional
- Uses different response format

