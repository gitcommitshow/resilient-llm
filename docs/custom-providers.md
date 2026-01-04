# Custom Provider Guide

This guide explains how to add and configure custom LLM providers that are not available by default in ResilientLLM.

## Overview

ResilientLLM uses a `ProviderRegistry` to manage LLM providers. By default, it includes support for:
- OpenAI
- Anthropic (Claude)
- Google (Gemini)
- Ollama

You can extend this by adding your own providers, such as:
- Self-hosted models (e.g., vLLM, Text Generation Inference)
- OpenAI-compatible APIs (e.g., Together AI, Groq, Perplexity)
- Custom API endpoints
- Other LLM providers with compatible interfaces

## Quick Start

The simplest way to add a custom provider is using `ProviderRegistry.configure()`:

```javascript
import { ResilientLLM, ProviderRegistry } from 'resilient-llm';

// Configure a new provider
ProviderRegistry.configure('my-provider', {
  chatApiUrl: 'https://api.example.com/v1/chat/completions',
  defaultModel: 'my-model-v1',
  envVarNames: ['MY_PROVIDER_API_KEY'],
  authConfig: {
    type: 'header',
    headerName: 'Authorization',
    headerFormat: 'Bearer {key}'
  }
});

// Use it with ResilientLLM
const llm = new ResilientLLM({
  aiService: 'my-provider',
  model: 'my-model-v1'
});

const response = await llm.chat([
  { role: 'user', content: 'Hello!' }
]);
```

## Configuration Options

### Required Configuration

#### `chatApiUrl` (or `baseUrl`)

The API endpoint for chat completions.

```javascript
chatApiUrl: 'https://api.example.com/v1/chat/completions'
```

**Alternative:** Use `baseUrl` for convenience. For OpenAI-compatible APIs, it will automatically append `/v1/chat/completions`:

```javascript
baseUrl: 'https://api.example.com'  // Becomes https://api.example.com/v1/chat/completions
```

For Ollama-compatible APIs, `baseUrl` will append `/api/generate`:

```javascript
baseUrl: 'http://localhost:11434'  // Becomes http://localhost:11434/api/generate
```

### Authentication Configuration

#### `authConfig`

Controls how API keys are sent to the provider.

**Header-based authentication (default):**

```javascript
authConfig: {
  type: 'header',
  headerName: 'Authorization',        // Header name
  headerFormat: 'Bearer {key}',       // Format template (use {key} placeholder)
  optional: false                     // Whether API key is optional
}
```

**Query parameter authentication:**

```javascript
authConfig: {
  type: 'query',
  queryParam: 'key',                  // Query parameter name
  optional: false
}
```

**Optional authentication:**

```javascript
authConfig: {
  type: 'header',
  headerName: 'Authorization',
  headerFormat: 'Bearer {key}',
  optional: true  // API key not required
}
```

#### API Key Priority Order

API keys can be provided in multiple ways, with the following priority order (highest to lowest):

1. **`llmOptions.apiKey`** - Passed directly in the `chat()` method call (highest priority, per-request)
2. **`ProviderRegistry.configure()` with `apiKey`** - Direct API key in provider configuration
3. **Environment variables** - Via `envVarNames` configuration

#### `apiKey` (direct in ProviderRegistry)

You can provide the API key directly when configuring a provider:

```javascript
ProviderRegistry.configure('my-provider', {
  chatApiUrl: 'https://api.example.com/v1/chat/completions',
  apiKey: 'sk-...'  // Stored securely, not serialized
});
```

#### `apiKey` (per-request via llmOptions)

You can also override the API key for individual requests by passing it in `llmOptions`:

```javascript
const response = await llm.chat(conversationHistory, {
  aiService: 'my-provider',
  apiKey: 'sk-custom-key-for-this-request'  // Takes precedence over ProviderRegistry
});
```

#### `envVarNames`

Environment variable names to check for API keys (checked in order, lowest priority):

```javascript
envVarNames: ['MY_PROVIDER_API_KEY', 'MY_PROVIDER_KEY']
```

### Model Configuration

#### `defaultModel`

The default model identifier to use:

```javascript
defaultModel: 'my-model-v1'
```

#### `modelsApiUrl`

Optional URL to fetch available models:

```javascript
modelsApiUrl: 'https://api.example.com/v1/models'
```

If not provided, you can still use the provider, but model discovery won't work.

### Chat API Configuration

#### `chatConfig`

Controls how messages are formatted and responses are parsed.

**Message Format:**

```javascript
chatConfig: {
  messageFormat: 'openai'  // or 'anthropic'
}
```

- `'openai'`: System messages stay in the messages array (default for most providers)
- `'anthropic'`: System messages are extracted and sent separately

**Response Parsing:**

```javascript
chatConfig: {
  responseParsePath: 'choices[0].message.content'  // Path to extract content
}
```

Common paths:
- OpenAI-compatible: `'choices[0].message.content'`
- Anthropic: `'content[0].text'`
- Ollama: `'response'`

**Tool Schema:**

```javascript
chatConfig: {
  toolSchemaType: 'openai'  // or 'anthropic'
}
```

- `'openai'`: Tools use `parameters` field
- `'anthropic'`: Tools use `input_schema` field

### Model Parsing Configuration

#### `parseConfig`

Controls how model lists are parsed from the API response.

```javascript
parseConfig: {
  modelsPath: 'data',              // Path to models array (e.g., 'data', 'models', 'items')
  idField: 'id',                   // Field name for model ID
  nameField: 'id',                 // Field name for model name
  displayNameField: 'display_name', // Field name for display name (optional)
  contextWindowField: 'inputTokenLimit', // Field name for context window (optional)
  idPrefix: null                   // Prefix to strip from model ID (e.g., 'models/')
}
```

### Additional Configuration

#### `displayName`

Human-readable name for the provider:

```javascript
displayName: 'My Custom Provider'
```

#### `apiVersion`

API version header (if required):

```javascript
apiVersion: '2023-06-01'
```

#### `customHeaders`

Additional HTTP headers:

```javascript
customHeaders: {
  'X-Custom-Header': 'value',
  'User-Agent': 'MyApp/1.0'
}
```

#### `active`

Enable/disable the provider:

```javascript
active: true  // or false to disable
```

## Examples

### Example 1: OpenAI-Compatible Provider (Together AI)

```javascript
import { ProviderRegistry } from 'resilient-llm';

ProviderRegistry.configure('together', {
  chatApiUrl: 'https://api.together.xyz/v1/chat/completions',
  modelsApiUrl: 'https://api.together.xyz/v1/models',
  defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
  envVarNames: ['TOGETHER_API_KEY'],
  displayName: 'Together AI',
  authConfig: {
    type: 'header',
    headerName: 'Authorization',
    headerFormat: 'Bearer {key}'
  },
  chatConfig: {
    messageFormat: 'openai',
    responseParsePath: 'choices[0].message.content',
    toolSchemaType: 'openai'
  },
  parseConfig: {
    modelsPath: 'data',
    idField: 'id',
    nameField: 'id'
  }
});
```

### Example 2: Self-Hosted vLLM (OpenAI-Compatible)

```javascript
import { ProviderRegistry } from 'resilient-llm';

ProviderRegistry.configure('vllm', {
  baseUrl: 'http://localhost:8000',  // vLLM default port
  defaultModel: 'meta-llama/Llama-3-70b-chat-hf',
  displayName: 'vLLM (Local)',
  authConfig: {
    type: 'header',
    headerName: 'Authorization',
    headerFormat: 'Bearer {key}',
    optional: true  // vLLM may not require auth
  },
  chatConfig: {
    messageFormat: 'openai',
    responseParsePath: 'choices[0].message.content',
    toolSchemaType: 'openai'
  }
});
```

### Example 3: Anthropic-Compatible Provider

```javascript
import { ProviderRegistry } from 'resilient-llm';

ProviderRegistry.configure('custom-anthropic', {
  chatApiUrl: 'https://api.custom-anthropic.com/v1/messages',
  modelsApiUrl: 'https://api.custom-anthropic.com/v1/models',
  defaultModel: 'custom-claude-v1',
  envVarNames: ['CUSTOM_ANTHROPIC_API_KEY'],
  displayName: 'Custom Anthropic',
  customHeaders: {
    'anthropic-version': '2023-06-01'
  },
  authConfig: {
    type: 'header',
    headerName: 'x-api-key',
    headerFormat: '{key}'
  },
  chatConfig: {
    messageFormat: 'anthropic',
    responseParsePath: 'content[0].text',
    toolSchemaType: 'anthropic'
  },
  parseConfig: {
    modelsPath: 'data',
    idField: 'id',
    nameField: 'id',
    displayNameField: 'display_name'
  }
});
```

### Example 4: Query Parameter Authentication (Google-style)

```javascript
import { ProviderRegistry } from 'resilient-llm';

ProviderRegistry.configure('custom-google', {
  chatApiUrl: 'https://api.example.com/v1/chat/completions',
  modelsApiUrl: 'https://api.example.com/v1/models',
  defaultModel: 'custom-model',
  envVarNames: ['CUSTOM_API_KEY'],
  displayName: 'Custom Google-Style',
  authConfig: {
    type: 'query',
    queryParam: 'key'
  },
  chatConfig: {
    messageFormat: 'openai',
    responseParsePath: 'choices[0].message.content',
    toolSchemaType: 'openai'
  },
  parseConfig: {
    modelsPath: 'models',
    idField: 'name',
    nameField: 'name',
    displayNameField: 'displayName',
    contextWindowField: 'inputTokenLimit',
    idPrefix: 'models/'
  }
});
```

### Example 5: Ollama-Compatible Provider

```javascript
import { ProviderRegistry } from 'resilient-llm';

ProviderRegistry.configure('local-ollama', {
  baseUrl: 'http://localhost:11434',  // Auto-generates /api/generate and /api/tags
  defaultModel: 'llama3.1:8b',
  displayName: 'Local Ollama',
  authConfig: {
    type: 'header',
    headerName: 'Authorization',
    headerFormat: 'Bearer {key}',
    optional: true
  },
  chatConfig: {
    messageFormat: 'openai',
    responseParsePath: 'response',
    toolSchemaType: 'openai'
  },
  parseConfig: {
    modelsPath: 'models',
    idField: 'name',
    nameField: 'name'
  }
});
```

## Using Custom Providers

### Basic Usage

Once configured, use your custom provider just like any built-in provider:

```javascript
import { ResilientLLM, ProviderRegistry } from 'resilient-llm';

// Configure provider (do this once, typically at app startup)
ProviderRegistry.configure('my-provider', { /* ... */ });

// Use with ResilientLLM
const llm = new ResilientLLM({
  aiService: 'my-provider',
  model: 'my-model'
});

const response = await llm.chat([
  { role: 'user', content: 'Hello!' }
]);

// Or override API key per request
const response = await llm.chat([
  { role: 'user', content: 'Hello!' }
], {
  apiKey: 'sk-custom-key-for-this-request'
});
```

### Override Provider Per Request

You can override the provider and API key for individual requests:

```javascript
const llm = new ResilientLLM({ aiService: 'openai' });

// Use custom provider for this request
const response = await llm.chat(conversationHistory, {
  aiService: 'my-provider',
  model: 'my-model'
});

// Override both provider and API key for this request
const response = await llm.chat(conversationHistory, {
  aiService: 'my-provider',
  model: 'my-model',
  apiKey: 'sk-custom-key-here'  // Overrides ProviderRegistry and env vars
});
```

### Fetching Available Models

If you've configured `modelsApiUrl`, you can fetch available models:

```javascript
import { ProviderRegistry } from 'resilient-llm';

// Fetch models for your custom provider
const models = await ProviderRegistry.getModels('my-provider');
console.log(models);
// [
//   { id: 'model-1', provider: 'my-provider', name: 'Model 1', ... },
//   { id: 'model-2', provider: 'my-provider', name: 'Model 2', ... }
// ]

// Get a specific model
const model = await ProviderRegistry.getModel('my-provider', 'model-1');
```

## Provider Registry Methods

### `ProviderRegistry.configure(providerName, config)`

Configure or update a provider. Merges with existing configuration.

```javascript
ProviderRegistry.configure('my-provider', {
  chatApiUrl: 'https://api.example.com/v1/chat/completions',
  defaultModel: 'my-model'
});
```

### `ProviderRegistry.get(providerName)`

Get provider configuration (without API key):

```javascript
const config = ProviderRegistry.get('my-provider');
console.log(config.chatApiUrl);
```

### `ProviderRegistry.list(options)`

List all configured providers:

```javascript
// List all providers
const all = ProviderRegistry.list();

// List only active providers
const active = ProviderRegistry.list({ active: true });
```

### `ProviderRegistry.hasApiKey(providerName)`

Check if an API key is available for a provider (without exposing the key):

```javascript
const hasKey = ProviderRegistry.hasApiKey('my-provider');
if (hasKey) {
  console.log('API key is configured');
}
```

### `ProviderRegistry.getModels(providerName, apiKey)`

Fetch models from the provider's API:

```javascript
const models = await ProviderRegistry.getModels('my-provider');
```

### `ProviderRegistry.clearCache(providerName)`

Clear cached models:

```javascript
// Clear cache for specific provider
ProviderRegistry.clearCache('my-provider');

// Clear all caches
ProviderRegistry.clearCache();
```

## Troubleshooting

### Provider Not Found Error

**Error:** `Invalid provider specified: "my-provider"`

**Solution:** Ensure you've called `ProviderRegistry.configure()` before using the provider:

```javascript
// Do this first
ProviderRegistry.configure('my-provider', { /* ... */ });

// Then use it
const llm = new ResilientLLM({ aiService: 'my-provider' });
```

### API Key Not Found

**Error:** `MY_PROVIDER_API_KEY is not set for provider "my-provider"`

**Solutions:**
1. **Per-request (highest priority):** Pass the API key in `llmOptions`:
   ```javascript
   const response = await llm.chat(conversationHistory, {
     aiService: 'my-provider',
     apiKey: 'sk-...'
   });
   ```

2. **Via ProviderRegistry:** Provide the key when configuring:
   ```javascript
   ProviderRegistry.configure('my-provider', {
     apiKey: 'sk-...'
   });
   ```

3. **Via environment variable:** Set the environment variable:
   ```bash
   export MY_PROVIDER_API_KEY=sk-...
   ```

4. **Mark auth as optional:** If the provider doesn't require authentication:
   ```javascript
   authConfig: {
     optional: true
   }
   ```

### Incorrect Response Format

**Symptom:** Responses are empty or malformed

**Solution:** Check and adjust `chatConfig.responseParsePath`:

```javascript
// Try different paths based on your API response
chatConfig: {
  responseParsePath: 'choices[0].message.content'  // OpenAI-style
  // or
  responseParsePath: 'content[0].text'             // Anthropic-style
  // or
  responseParsePath: 'response'                    // Ollama-style
}
```

Inspect the actual API response to determine the correct path:

```javascript
// Temporarily log the response
const response = await fetch(apiUrl, { /* ... */ });
const data = await response.json();
console.log(JSON.stringify(data, null, 2));
```

### Models Not Fetching

**Symptom:** `getModels()` returns empty array

**Solutions:**
1. Ensure `modelsApiUrl` is configured correctly
2. Check API key is valid
3. Verify the API response format matches `parseConfig`
4. Check browser console for errors

### Message Format Issues

**Symptom:** System messages not working correctly

**Solution:** Adjust `chatConfig.messageFormat`:

```javascript
// If your API expects system messages in the messages array
chatConfig: {
  messageFormat: 'openai'
}

// If your API expects system messages separately
chatConfig: {
  messageFormat: 'anthropic'
}
```

## Best Practices

1. **Configure providers at application startup:** Set up all custom providers before creating `ResilientLLM` instances.

2. **Use environment variables for API keys:** Avoid hardcoding keys in your code. Use `envVarNames` to reference environment variables.

3. **Test with a simple request first:** Before integrating into your application, test with a basic chat request to verify configuration.

4. **Cache models when possible:** If your provider supports model listing, use `ProviderRegistry.getModels()` to cache available models.

5. **Handle errors gracefully:** Custom providers may have different error formats. Note that `onError` callback in `ResilientLLM` is currently reserved for future use.

6. **Document your configuration:** Keep a record of your custom provider configurations for your team.

## Advanced: Updating Existing Providers

You can also update existing default providers:

```javascript
// Update OpenAI to use a different endpoint
ProviderRegistry.configure('openai', {
  chatApiUrl: 'https://custom-openai-proxy.com/v1/chat/completions'
});

// Disable a provider
ProviderRegistry.configure('ollama', {
  active: false
});
```

## See Also

- [Reference Documentation](./reference.md) - Complete API reference
- [ProviderRegistry Source](../lib/ProviderRegistry.js) - Implementation details

