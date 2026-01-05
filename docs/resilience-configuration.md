# Resilience Configuration Guide

This guide explains how to configure resilience features in ResilientLLM to handle failures, rate limits, and ensure reliable LLM operations in production.

## Table of Contents

- [Overview](#overview)
- [Configuration Scope](#configuration-scope)
- [Configuration Options](#configuration-options)
- [When to Configure](#when-to-configure)
- [Default Values](#default-values)
- [Configuration Examples](#configuration-examples)
- [Best Practices](#best-practices)
- [Understanding Resilience Mechanisms](#understanding-resilience-mechanisms)

---

## Overview

ResilientLLM provides multiple layers of resilience to handle common production challenges:

- **Retry Logic**: Automatic retries with exponential backoff for transient failures
- **Rate Limiting**: Token bucket algorithm to respect provider rate limits
- **Circuit Breaker**: Prevents cascading failures by temporarily stopping requests when a service is failing
- **Timeout Control**: Prevents operations from hanging indefinitely
- **Caching**: Reduces redundant API calls for identical requests
- **Automatic Fallback**: Switches to alternative providers when rate limits are hit

All resilience features are configured through the `ResilientLLM` constructor options.

---

## Configuration Scope

Understanding where resilience configuration applies is crucial for proper usage. Here's how configuration scope works:

### Per Instance (Not Global)

**Resilience configuration is per `ResilientLLM` instance**, not global. Each instance maintains its own configuration:

```javascript
// Instance 1: Production config
const productionLLM = new ResilientLLM({
  retries: 5,
  timeout: 120000,
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
});

// Instance 2: Development config (independent)
const developmentLLM = new ResilientLLM({
  retries: 2,
  timeout: 30000,
  rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 40000 }
});

// Both instances operate independently with their own configs
await productionLLM.chat(history1);   // Uses production config
await developmentLLM.chat(history2);   // Uses development config
```

**Per-instance configuration:**
- ✅ `retries` - Each instance has its own retry count
- ✅ `backoffFactor` - Each instance has its own backoff strategy
- ✅ `timeout` - Each instance has its own timeout
- ✅ `cacheStore` - Each instance has its own cache
- ✅ `onRateLimitUpdate` - Each instance has its own callback

### Shared Per Service (Rate Limiting & Circuit Breaker)

**Rate limiting and circuit breaker are shared per `aiService` (provider)** across all instances using the same service:

```javascript
// Both instances use 'openai' service
const llm1 = new ResilientLLM({
  aiService: 'openai',
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
});

const llm2 = new ResilientLLM({
  aiService: 'openai',  // Same service
  rateLimitConfig: { requestsPerMinute: 1000, llmTokensPerMinute: 320000 }
  // ⚠️ Note: llm2's rateLimitConfig is ignored!
  // The first instance (llm1) sets the shared rate limit config
});

// Both instances share the same rate limiter and circuit breaker for 'openai'
await llm1.chat(history1);  // Consumes from shared 'openai' token bucket
await llm2.chat(history2);  // Also consumes from shared 'openai' token bucket
```

**Why this matters:**
- All `ResilientLLM` instances using the same `aiService` share the same rate limit buckets
- All instances using the same `aiService` share the same circuit breaker state
- **First instance wins**: The first instance to use a service sets the rate limit config
- Subsequent instances with the same service reuse the existing rate limiter/circuit breaker

**Best practice:** Use consistent `rateLimitConfig` across all instances of the same service, or create instances in a controlled order so the first one sets the desired limits.

### NOT Per Request

**Resilience configuration cannot be overridden per request.** All requests made with an instance use that instance's configuration:

```javascript
const llm = new ResilientLLM({
  retries: 3,
  timeout: 60000
});

// ❌ This won't work - resilience config can't be overridden per request
await llm.chat(conversationHistory, {
  retries: 5,        // Ignored! Uses instance's retries: 3
  timeout: 120000   // Ignored! Uses instance's timeout: 60000
});

// ✅ To use different resilience settings, create a new instance
const highRetryLLM = new ResilientLLM({
  retries: 5,
  timeout: 120000
});
await highRetryLLM.chat(conversationHistory);  // Uses retries: 5
```

**What CAN be overridden per request:**
- ✅ `model` - Override model for this request
- ✅ `temperature` - Override temperature for this request
- ✅ `maxTokens` - Override max tokens for this request
- ✅ `aiService` - Switch provider for this request
- ✅ `apiKey` - Override API key for this request

**What CANNOT be overridden per request:**
- ❌ `retries` - Use instance's retry count
- ❌ `backoffFactor` - Use instance's backoff factor
- ❌ `timeout` - Use instance's timeout
- ❌ `rateLimitConfig` - Use instance's rate limit config (or shared service config)
- ❌ `cacheStore` - Use instance's cache store
- ❌ `onRateLimitUpdate` - Use instance's callback

### Summary Table

| Configuration | Scope | Can Override Per Request? |
|--------------|-------|---------------------------|
| `retries` | Per instance | ❌ No |
| `backoffFactor` | Per instance | ❌ No |
| `timeout` | Per instance | ❌ No |
| `rateLimitConfig` | Shared per `aiService` | ❌ No |
| `cacheStore` | Per instance | ❌ No |
| `onRateLimitUpdate` | Per instance | ❌ No |
| `model` | Per instance (default) | ✅ Yes |
| `temperature` | Per instance (default) | ✅ Yes |
| `maxTokens` | Per instance (default) | ✅ Yes |
| `aiService` | Per instance (default) | ✅ Yes |

---

## Configuration Options

### Retry Configuration

#### `retries`

Number of retry attempts for failed requests before giving up.

**Type:** `number`  
**Default:** `3`  
**Range:** `0` (no retries) to any positive integer

**Behavior:**
- Each retry attempt counts as a separate failure in the circuit breaker
- Retries only occur for retryable errors (429, 500+, timeouts)
- Non-retryable errors (400, 401, 403, AbortError) are not retried

**Example:**
```javascript
const llm = new ResilientLLM({
  retries: 5  // Will attempt up to 5 retries (6 total attempts)
});
```

#### `backoffFactor`

Exponential backoff multiplier between retry attempts.

**Type:** `number`  
**Default:** `2`  
**Range:** `> 1` (typically 1.5 to 3)

**Behavior:**
- Initial delay: 1000ms (1 second)
- Delay after 1st retry: 1000ms × backoffFactor
- Delay after 2nd retry: 2000ms × backoffFactor
- And so on...

**Example:**
```javascript
const llm = new ResilientLLM({
  retries: 3,
  backoffFactor: 2  // Delays: 1s, 2s, 4s, 8s
});
```

**Note:** The `retry-after` header from API responses takes precedence over calculated backoff delays.

### Timeout Configuration

#### `timeout`

Total timeout in milliseconds for the entire operation, including all retry attempts.

**Type:** `number`  
**Default:** `60000` (60 seconds)  
**Environment Variable:** `LLM_TIMEOUT`

**Behavior:**
- Applies to the entire operation (initial attempt + all retries)
- Uses `AbortController` to cancel ongoing requests when timeout is reached
- Throws `TimeoutError` if operation exceeds timeout

**Example:**
```javascript
const llm = new ResilientLLM({
  timeout: 30000  // 30 seconds total for operation + retries
});
```

**Important:** Set timeout to accommodate your retry strategy. For example, with `retries: 3` and `backoffFactor: 2`, you might need at least 15-20 seconds to allow for all retry attempts.

### Rate Limiting Configuration

#### `rateLimitConfig`

Configuration for token bucket rate limiting to respect provider limits.

**Type:** `Object`  
**Default:** `{ requestsPerMinute: 10, llmTokensPerMinute: 150000 }`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `requestsPerMinute` | `number` | Maximum number of requests allowed per minute |
| `llmTokensPerMinute` | `number` | Maximum number of LLM tokens allowed per minute |

**Behavior:**
- Uses two separate token buckets: one for requests, one for LLM tokens
- Automatically waits when buckets are empty
- Tokens refill continuously (not in bursts)
- Can be updated dynamically from API response headers

**Example:**
```javascript
const llm = new ResilientLLM({
  rateLimitConfig: {
    requestsPerMinute: 60,        // 60 requests per minute
    llmTokensPerMinute: 90000     // 90,000 tokens per minute
  }
});
```

**Provider-Specific Recommendations:**

- **OpenAI:** 
  - Tier 1: `{ requestsPerMinute: 500, llmTokensPerMinute: 160000 }`
  - Tier 2: `{ requestsPerMinute: 3500, llmTokensPerMinute: 10000000 }`
  
- **Anthropic:**
  - Standard: `{ requestsPerMinute: 50, llmTokensPerMinute: 40000 }`
  - Premium: `{ requestsPerMinute: 200, llmTokensPerMinute: 200000 }`
  
- **Google/Gemini:**
  - Standard: `{ requestsPerMinute: 60, llmTokensPerMinute: 32000 }`

**Note:** Check your provider's current rate limits and adjust accordingly. The library will automatically adapt if rate limits are updated from API responses.

#### `onRateLimitUpdate`

Callback function called when rate limit information is updated from API responses.

**Type:** `Function`  
**Default:** `undefined` (optional)

**Signature:**
```javascript
onRateLimitUpdate: (rateLimitInfo) => void
```

**Parameters:**
- `rateLimitInfo.requestsPerMinute` (optional) - Updated requests per minute limit
- `rateLimitInfo.llmTokensPerMinute` (optional) - Updated LLM tokens per minute limit

**Use Cases:**
- Logging rate limit changes
- Updating monitoring dashboards
- Adjusting application behavior based on current limits

**Example:**
```javascript
const llm = new ResilientLLM({
  onRateLimitUpdate: (info) => {
    console.log('Rate limits updated:', info);
    // Update monitoring/metrics
    metrics.setRateLimit(info.requestsPerMinute, info.llmTokensPerMinute);
  }
});
```

### Caching Configuration

#### `cacheStore`

Cache store object for storing successful API responses.

**Type:** `Object`  
**Default:** `{}` (empty object, caching disabled)

**Behavior:**
- Cache keys are SHA-256 hashes of API URL, request body, and headers
- Only successful responses (status 200) are cached
- Cache is checked before making HTTP requests
- Cache hits return immediately without API call

**Example:**
```javascript
// Simple in-memory cache
const cacheStore = {};
const llm = new ResilientLLM({ cacheStore });

// Or use a persistent cache (e.g., Redis-like interface)
const persistentCache = {
  get: (key) => redis.get(key),
  set: (key, value) => redis.set(key, value, 'EX', 3600)
};
const llm = new ResilientLLM({ cacheStore: persistentCache });
```

**Note:** The cache store must support object property access (`cacheStore[key] = value` and `cacheStore[key]`). For advanced caching needs, wrap your cache implementation to match this interface.

---

## When to Configure

> **Important:** See [Configuration Scope](#configuration-scope) above to understand where configuration applies (per instance, shared per service, or per request).

### Updating Configuration for Existing Instances

**Recommended:** Create a new instance with the desired configuration.

```javascript
// Need different config? Create a new instance
const highRetryLLM = new ResilientLLM({
  retries: 5,
  timeout: 120000,
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
});
```

**⚠️ Note:** While you can modify instance properties directly (e.g., `llm.retries = 5`), this is not recommended as it's not part of the public API and may lead to unexpected behavior, especially with shared rate limiters.

**Factory Pattern Example:**

```javascript
class LLMFactory {
  constructor() {
    this.instances = new Map();
  }
  
  getInstance(config) {
    const key = JSON.stringify(config);
    if (!this.instances.has(key)) {
      this.instances.set(key, new ResilientLLM(config));
    }
    return this.instances.get(key);
  }
}

const factory = new LLMFactory();
const prodLLM = factory.getInstance({ retries: 5, timeout: 120000 });
const devLLM = factory.getInstance({ retries: 2, timeout: 30000 });
```

### Constructor Options (Recommended)

Set resilience configuration when creating the `ResilientLLM` instance. This applies to all requests made with that instance (see [Configuration Scope](#configuration-scope) for details).

```javascript
const llm = new ResilientLLM({
  retries: 5,
  backoffFactor: 2,
  timeout: 120000,
  rateLimitConfig: {
    requestsPerMinute: 60,
    llmTokensPerMinute: 90000
  },
  cacheStore: {},
  onRateLimitUpdate: (info) => console.log('Rate limit updated:', info)
});
```

### Environment Variables

Some options can be set via environment variables for convenience:

```bash
# Timeout
export LLM_TIMEOUT=60000

# Other LLM options (not resilience-specific)
export PREFERRED_AI_SERVICE=anthropic
export PREFERRED_AI_MODEL=claude-3-5-sonnet-20240620
export MAX_TOKENS=2048
export AI_TEMPERATURE=0
```

**Note:** Resilience options (`retries`, `backoffFactor`, `rateLimitConfig`) cannot be set via environment variables. Use constructor options instead.

### Per-Request Overrides

Some options can be overridden per-request via `llmOptions` in the `chat()` method:

```javascript
// Global configuration
const llm = new ResilientLLM({
  retries: 3,
  timeout: 60000
});

// Override for specific request
await llm.chat(conversationHistory, {
  // Note: retries and timeout are NOT overridable per-request
  // Only LLM-specific options (model, temperature, etc.) can be overridden
});
```

**Important:** Resilience configuration (`retries`, `backoffFactor`, `timeout`, `rateLimitConfig`) is set at the instance level and applies to all requests made with that instance. To use different resilience settings, create separate `ResilientLLM` instances. See [Configuration Scope](#configuration-scope) for details on how rate limiting and circuit breakers are shared per service.

---

## Default Values

| Option | Default Value | Environment Variable | Notes |
|--------|---------------|---------------------|-------|
| `retries` | `3` | None | 3 retry attempts (4 total attempts) |
| `backoffFactor` | `2` | None | Doubles delay each retry |
| `timeout` | `60000` (60s) | `LLM_TIMEOUT` | Total timeout for operation + retries |
| `rateLimitConfig.requestsPerMinute` | `10` | None | Very conservative default |
| `rateLimitConfig.llmTokensPerMinute` | `150000` | None | Conservative default |
| `onRateLimitUpdate` | `undefined` | None | Optional callback |
| `cacheStore` | `{}` | None | Empty object (caching disabled) |

**Recommendation:** Always configure `rateLimitConfig` based on your provider's actual rate limits. The default values are very conservative and may unnecessarily slow down your application.

---

## Configuration Examples

### Production Configuration

```javascript
const llm = new ResilientLLM({
  aiService: 'openai',
  model: 'gpt-4o-mini',
  
  // Resilience configuration
  retries: 5,                    // More retries for production
  backoffFactor: 2,              // Standard exponential backoff
  timeout: 120000,               // 2 minutes for operation + retries
  
  // Rate limiting based on OpenAI Tier 1 limits
  rateLimitConfig: {
    requestsPerMinute: 500,
    llmTokensPerMinute: 160000
  },
  
  // Monitoring
  onRateLimitUpdate: (info) => {
    logger.info('Rate limit updated', info);
    metrics.recordRateLimitUpdate(info);
  },
  
  // Caching for cost optimization
  cacheStore: cacheStore  // Your cache implementation
});
```

### Development Configuration

```javascript
const llm = new ResilientLLM({
  aiService: 'anthropic',
  model: 'claude-3-5-sonnet-20240620',
  
  // Faster failures for development
  retries: 2,
  backoffFactor: 1.5,
  timeout: 30000,  // 30 seconds
  
  // Lower rate limits for development
  rateLimitConfig: {
    requestsPerMinute: 10,
    llmTokensPerMinute: 40000
  }
  
  // No caching in development (see fresh results)
  // cacheStore: {} (default)
});
```

### High-Throughput Configuration

```javascript
const llm = new ResilientLLM({
  aiService: 'openai',
  model: 'gpt-4o-mini',
  
  // Aggressive retry strategy
  retries: 3,
  backoffFactor: 1.5,  // Faster backoff
  timeout: 60000,
  
  // High rate limits (Tier 2 OpenAI)
  rateLimitConfig: {
    requestsPerMinute: 3500,
    llmTokensPerMinute: 10000000
  },
  
  // Caching to reduce API calls
  cacheStore: redisCache
});
```

### Cost-Optimized Configuration

```javascript
const llm = new ResilientLLM({
  aiService: 'anthropic',
  model: 'claude-3-haiku-20240307',  // Cheaper model
  
  // Fewer retries to fail fast
  retries: 2,
  backoffFactor: 2,
  timeout: 45000,
  
  // Conservative rate limits
  rateLimitConfig: {
    requestsPerMinute: 50,
    llmTokensPerMinute: 40000
  },
  
  // Aggressive caching
  cacheStore: persistentCache  // Long-lived cache
});
```

---

## Best Practices

### 1. Configure Rate Limits Based on Your Provider Tier

**Do:**
```javascript
// Check your provider's rate limits and configure accordingly
const llm = new ResilientLLM({
  rateLimitConfig: {
    requestsPerMinute: 500,      // Match your tier
    llmTokensPerMinute: 160000   // Match your tier
  }
});
```

**Don't:**
```javascript
// Don't use defaults without checking
const llm = new ResilientLLM();  // Defaults are too conservative
```

### 2. Understand Shared Rate Limiting Per Service

**Important:** Rate limiters and circuit breakers are shared across all instances using the same `aiService`. The first instance sets the config.

**Do:**
```javascript
// Use consistent rateLimitConfig across all instances of the same service
const llm1 = new ResilientLLM({
  aiService: 'openai',
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
});

const llm2 = new ResilientLLM({
  aiService: 'openai',
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
  // Same config - both instances share the rate limiter
});
```

**⚠️ Don't:** Create instances with different `rateLimitConfig` for the same service - the first instance's config will be used for all.

### 3. Set Timeout Appropriately for Your Retry Strategy

**Do:**
```javascript
// Timeout should accommodate: initial attempt + all retries + backoff delays
// With retries: 3, backoffFactor: 2
// Delays: 1s, 2s, 4s = ~7s minimum, add buffer for network
const llm = new ResilientLLM({
  retries: 3,
  backoffFactor: 2,
  timeout: 60000  // 60s allows for all retries with buffer
});
```

**Don't:**
```javascript
// Don't set timeout too low - it will cut off retries
const llm = new ResilientLLM({
  retries: 5,
  timeout: 5000  // Too low! Won't allow retries to complete
});
```

### 4. Use Separate Instances for Different Use Cases

**Do:**
```javascript
// Different instances for different resilience needs
const productionLLM = new ResilientLLM({
  retries: 5,
  timeout: 120000,
  rateLimitConfig: { requestsPerMinute: 500, llmTokensPerMinute: 160000 }
});

const developmentLLM = new ResilientLLM({
  retries: 2,
  timeout: 30000,
  rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 40000 }
});
```

**Don't:**
```javascript
// Don't try to override resilience config per-request
const llm = new ResilientLLM({ retries: 3 });
await llm.chat(history, { retries: 5 });  // Won't work!
```

### 5. Enable Caching for Cost Optimization

**Do:**
```javascript
// Use caching for identical requests
const cacheStore = {};
const llm = new ResilientLLM({ cacheStore });

// Identical requests will be served from cache
await llm.chat(conversationHistory);  // API call
await llm.chat(conversationHistory);  // Cache hit
```

**Don't:**
```javascript
// Don't cache if you need fresh results every time
const llm = new ResilientLLM();  // No cacheStore = no caching
```

### 6. Monitor Rate Limit Updates

**Do:**
```javascript
const llm = new ResilientLLM({
  onRateLimitUpdate: (info) => {
    // Log for debugging
    console.log('Rate limits updated:', info);
    
    // Update monitoring
    metrics.record('rate_limit_update', info);
    
    // Alert if limits drop significantly
    if (info.requestsPerMinute < 10) {
      alerting.sendAlert('Rate limit dropped significantly');
    }
  }
});
```

### 7. Handle AbortController for User Cancellation

**Do:**
```javascript
const llm = new ResilientLLM({ /* ... */ });

// User cancels request
const promise = llm.chat(conversationHistory);
llm.abort();  // Cancels all ongoing operations

try {
  await promise;
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('Request was cancelled');
  }
}
```

### 8. Adjust Retries Based on Error Types

**Understanding Retry Behavior:**
- **Retried:** 429 (rate limit), 500+ (server errors), timeouts
- **Not Retried:** 400 (bad request), 401 (unauthorized), 403 (forbidden), AbortError

**Do:**
```javascript
// More retries for rate-limited scenarios
const llm = new ResilientLLM({
  retries: 5,  // Good for handling rate limits
  backoffFactor: 2
});
```

**Note:** The library automatically handles `retry-after` headers from rate limit responses, so higher retry counts are safe.

### 9. Use Circuit Breaker Defaults (Not Configurable in ResilientLLM)

The circuit breaker is automatically configured with sensible defaults:
- **Failure Threshold:** 5 total failures (across all operations)
- **Cooldown Period:** 30 seconds

These defaults work well for most use cases. The circuit breaker prevents cascading failures by temporarily stopping requests when a service is consistently failing.

---

## Understanding Resilience Mechanisms

### Retry Logic

1. **Initial Attempt:** First request is made
2. **On Failure:** If error is retryable (429, 500+, timeout), wait for backoff delay
3. **Retry Attempt:** Make another request
4. **Repeat:** Continue until success or retries exhausted
5. **Final Failure:** Throw error if all retries fail

**Retryable Errors:**
- HTTP 429 (Rate Limit Exceeded)
- HTTP 500+ (Server Errors)
- HTTP 503 (Service Unavailable)
- TimeoutError
- Network errors

**Non-Retryable Errors:**
- HTTP 400 (Bad Request)
- HTTP 401 (Unauthorized)
- HTTP 403 (Forbidden)
- AbortError (User cancellation)

### Rate Limiting (Token Bucket)

1. **Two Buckets:** One for requests, one for LLM tokens
2. **Token Consumption:** Each request consumes 1 request token + N LLM tokens
3. **Automatic Waiting:** If tokens unavailable, operation waits until tokens refill
4. **Continuous Refill:** Tokens refill continuously (not in bursts)
5. **Dynamic Updates:** Buckets can be updated from API response headers

**Example:**
```javascript
// With rateLimitConfig: { requestsPerMinute: 60, llmTokensPerMinute: 60000 }
// Request 1: Consumes 1 request token + 1000 LLM tokens
// Request 2: If tokens available, proceeds immediately
// Request 3: If tokens exhausted, waits until refill
```

### Circuit Breaker

1. **Closed State:** Normal operation, requests proceed
2. **Failure Tracking:** Each failure increments failure count
3. **Open State:** When failure threshold reached, circuit opens
4. **Cooldown:** Circuit stays open for cooldown period
5. **Half-Open:** After cooldown, circuit allows test requests
6. **Reset:** Success resets failure count, circuit closes

**Default Behavior:**
- Opens after 5 total failures (across all operations)
- Stays open for 30 seconds
- Automatically attempts to close after cooldown

### Timeout Control

1. **Total Timeout:** Applies to entire operation (initial + retries)
2. **AbortController:** Uses native AbortController for cancellation
3. **Automatic Cancellation:** HTTP request is aborted when timeout reached
4. **TimeoutError:** Throws TimeoutError if operation exceeds timeout

**Important:** Timeout should be set high enough to allow all retry attempts to complete.

### Caching

1. **Cache Key:** SHA-256 hash of URL + request body + headers
2. **Cache Check:** Before making HTTP request, check cache
3. **Cache Hit:** Return cached response immediately
4. **Cache Miss:** Make API request, cache successful responses (status 200)

**Cache Invalidation:** Manual (clear cacheStore object) or implement TTL in your cache store.

---

## Summary

ResilientLLM provides comprehensive resilience features that can be configured to match your production needs:

- **Retries:** Configure `retries` and `backoffFactor` for transient failure handling
- **Timeouts:** Set `timeout` to prevent operations from hanging
- **Rate Limiting:** Configure `rateLimitConfig` based on your provider's limits
- **Caching:** Enable `cacheStore` to reduce redundant API calls
- **Monitoring:** Use `onRateLimitUpdate` to track rate limit changes

**Key Takeaways:**
1. Always configure `rateLimitConfig` based on your provider tier
2. Set `timeout` high enough to accommodate all retries
3. Use separate instances for different resilience needs
4. Enable caching for cost optimization
5. Monitor rate limit updates for debugging

For more details on the API, see the [Reference Documentation](./reference.md).

