# Adaptive Rate Limiting from Provider Response Headers

## Overview

The library currently configures rate limits statically via constructor/per-request config (`requestsPerMinute`, `llmTokensPerMinute`). Real LLM providers return actual rate limit state in HTTP response headers — limits, remaining quota, and reset timing. This feature parses those headers and feeds them back into the `TokenBucket` / `RateLimitManager` so rate limiting adapts to the provider's real-time state instead of relying on user-supplied guesses.

## Problem Statement

1. **`_makeHttpRequest` discards headers.** It logs `response.headers` but returns only `{ data, statusCode }`. Rate limit headers are lost.
2. **`RateLimitManager.update()` is never called from real data.** `ResilientOperation._executeBasic` checks for `result.rateLimitInfo` but `_makeHttpRequest` never populates it.
3. **Static config is often wrong.** Users must guess their provider's RPM/TPM. If they set values too high, they get 429s. Too low, they under-utilize their quota.
4. **`TokenBucket.update()` resets tokens to full capacity.** Even if the provider says only 100 tokens remain, calling `update()` fills the bucket to `capacity`. There is no way to set remaining tokens from an external source.
5. **Provider header formats vary.** OpenAI uses `x-ratelimit-*` headers with duration-style resets (`12ms`). Anthropic uses `anthropic-ratelimit-*` headers with ISO timestamp resets. Google/Gemini and Ollama may have their own formats or no rate limit headers at all.

## Goals

1. **Automatic adaptation**: After every successful LLM response, parse provider rate limit headers and sync the token buckets to the provider's actual state.
2. **Provider-extensible parsing**: Each provider's header format is defined in `ProviderRegistry` config. Adding a new provider's rate limit headers should require only config, no code changes.
3. **Graceful fallback**: If a response has no rate limit headers (e.g., Ollama), the existing static config continues to work unchanged.
4. **Remaining-aware sync**: `TokenBucket` must support setting `tokens` (remaining) directly from header values, not just capacity/refillRate.
5. **Reset-time awareness**: Use the provider's reset time to calculate accurate refill rates instead of assuming uniform per-second refill.

## Architecture

### Component Responsibilities

| Component | Current Role | New Role |
|---|---|---|
| `_makeHttpRequest` | Returns `{ data, statusCode }` | Also returns `responseHeaders` (raw headers object) |
| **`RateLimitHeaderParser`** (new) | — | Parses raw headers into normalized `RateLimitInfo` using provider-specific config |
| `ProviderRegistry` | Stores provider config (auth, chat, parse) | Also stores `rateLimitHeaderConfig` per provider |
| `RateLimitManager` | Manages request + token buckets with static config | Accepts `RateLimitInfo` to sync buckets to real provider state |
| `TokenBucket` | `update()` resets tokens to capacity | New `syncFromProvider()` sets both capacity and remaining tokens |
| `ResilientOperation` | Checks `result.rateLimitInfo` (never populated) | Passes parsed `RateLimitInfo` from response headers to `RateLimitManager` |
| `ResilientLLM.chat()` | Calls `_makeHttpRequest` and processes response | Passes provider name down so header parsing uses the right config |

### Data Flow

```
HTTP Response
    │
    ▼
_makeHttpRequest()  ──returns──▶  { data, statusCode, responseHeaders }
    │
    ▼
ResilientOperation._executeBasic()
    │
    ├── RateLimitHeaderParser.parse(providerName, responseHeaders)
    │       │
    │       ▼
    │   Normalized RateLimitInfo
    │
    ├── RateLimitManager.syncFromHeaders(rateLimitInfo)
    │       │
    │       ├── requestBucket.syncFromProvider(limit, remaining, resetMs)
    │       └── llmTokenBucket.syncFromProvider(limit, remaining, resetMs)
    │
    └── onRateLimitUpdate?.(rateLimitInfo)  // callback for consumers
```

## Normalized Rate Limit Info Schema

All provider-specific headers are parsed into this common structure:

```javascript
{
  // Request limits
  requests: {
    limit: number | null,       // max requests per window (e.g., 5000)
    remaining: number | null,   // requests remaining in current window
    resetMs: number | null      // ms until request limit resets
  },
  // Token limits (combined input+output for OpenAI, total for Anthropic)
  tokens: {
    limit: number | null,       // max tokens per window
    remaining: number | null,   // tokens remaining
    resetMs: number | null      // ms until token limit resets
  },
  // Anthropic-specific: separate input/output token limits (optional)
  inputTokens: {
    limit: number | null,
    remaining: number | null,
    resetMs: number | null
  } | null,
  outputTokens: {
    limit: number | null,
    remaining: number | null,
    resetMs: number | null
  } | null,
  // Metadata
  provider: string,             // e.g., 'openai', 'anthropic'
  requestId: string | null,     // provider's request ID for correlation
  processingMs: number | null,  // server-side processing time (OpenAI-specific)
  raw: Object                   // raw headers object for debugging
}
```

## Provider Header Mappings

### OpenAI

| Header | Maps To |
|---|---|
| `x-ratelimit-limit-requests` | `requests.limit` |
| `x-ratelimit-remaining-requests` | `requests.remaining` |
| `x-ratelimit-reset-requests` | `requests.resetMs` (parse duration string: `"12ms"`, `"6s"`, `"1m30s"`) |
| `x-ratelimit-limit-tokens` | `tokens.limit` |
| `x-ratelimit-remaining-tokens` | `tokens.remaining` |
| `x-ratelimit-reset-tokens` | `tokens.resetMs` (parse duration string) |
| `x-request-id` | `requestId` |
| `openai-processing-ms` | `processingMs` |

**Reset time format**: Duration string like `"12ms"`, `"6s"`, `"1m30s"`, `"2m"`. Must be parsed to milliseconds.

### Anthropic

| Header | Maps To |
|---|---|
| `anthropic-ratelimit-requests-limit` | `requests.limit` |
| `anthropic-ratelimit-requests-remaining` | `requests.remaining` |
| `anthropic-ratelimit-requests-reset` | `requests.resetMs` (parse ISO timestamp to ms-from-now) |
| `anthropic-ratelimit-tokens-limit` | `tokens.limit` |
| `anthropic-ratelimit-tokens-remaining` | `tokens.remaining` |
| `anthropic-ratelimit-tokens-reset` | `tokens.resetMs` (parse ISO timestamp) |
| `anthropic-ratelimit-input-tokens-limit` | `inputTokens.limit` |
| `anthropic-ratelimit-input-tokens-remaining` | `inputTokens.remaining` |
| `anthropic-ratelimit-input-tokens-reset` | `inputTokens.resetMs` (parse ISO timestamp) |
| `anthropic-ratelimit-output-tokens-limit` | `outputTokens.limit` |
| `anthropic-ratelimit-output-tokens-remaining` | `outputTokens.remaining` |
| `anthropic-ratelimit-output-tokens-reset` | `outputTokens.resetMs` (parse ISO timestamp) |
| `request-id` | `requestId` |

**Reset time format**: ISO 8601 timestamp like `"2026-02-22T05:48:17Z"`. Converted to ms-from-now: `Date.parse(value) - Date.now()`.

### Google / Gemini

Google's rate limit headers are not well-documented for the generativelanguage API. If present, they likely follow a pattern similar to OpenAI (since we use the OpenAI-compatible endpoint). The parser should handle the case where no rate limit headers are found and fall back to static config.

### Ollama (Local)

Ollama is self-hosted and does not return rate limit headers. The parser returns `null` and static config remains in effect.

## Provider Registry Config Extension

Add a `rateLimitHeaderConfig` field to each provider's configuration in `ProviderRegistry.DEFAULT_PROVIDERS`:

```javascript
rateLimitHeaderConfig: {
  // Header name mappings
  headers: {
    requestsLimit:     'x-ratelimit-limit-requests',
    requestsRemaining: 'x-ratelimit-remaining-requests',
    requestsReset:     'x-ratelimit-reset-requests',
    tokensLimit:       'x-ratelimit-limit-tokens',
    tokensRemaining:   'x-ratelimit-remaining-tokens',
    tokensReset:       'x-ratelimit-reset-tokens',
    requestId:         'x-request-id',
    processingMs:      'openai-processing-ms',
    // Optional: separate input/output tokens (Anthropic)
    inputTokensLimit:     null,
    inputTokensRemaining: null,
    inputTokensReset:     null,
    outputTokensLimit:    null,
    outputTokensRemaining:null,
    outputTokensReset:    null
  },
  // How to parse reset time values
  resetTimeFormat: 'duration' | 'iso8601',
  // Whether this provider returns rate limit headers at all
  enabled: true
}
```

**OpenAI config:**
```javascript
rateLimitHeaderConfig: {
  headers: {
    requestsLimit:     'x-ratelimit-limit-requests',
    requestsRemaining: 'x-ratelimit-remaining-requests',
    requestsReset:     'x-ratelimit-reset-requests',
    tokensLimit:       'x-ratelimit-limit-tokens',
    tokensRemaining:   'x-ratelimit-remaining-tokens',
    tokensReset:       'x-ratelimit-reset-tokens',
    requestId:         'x-request-id',
    processingMs:      'openai-processing-ms'
  },
  resetTimeFormat: 'duration',
  enabled: true
}
```

**Anthropic config:**
```javascript
rateLimitHeaderConfig: {
  headers: {
    requestsLimit:        'anthropic-ratelimit-requests-limit',
    requestsRemaining:    'anthropic-ratelimit-requests-remaining',
    requestsReset:        'anthropic-ratelimit-requests-reset',
    tokensLimit:          'anthropic-ratelimit-tokens-limit',
    tokensRemaining:      'anthropic-ratelimit-tokens-remaining',
    tokensReset:          'anthropic-ratelimit-tokens-reset',
    inputTokensLimit:     'anthropic-ratelimit-input-tokens-limit',
    inputTokensRemaining: 'anthropic-ratelimit-input-tokens-remaining',
    inputTokensReset:     'anthropic-ratelimit-input-tokens-reset',
    outputTokensLimit:    'anthropic-ratelimit-output-tokens-limit',
    outputTokensRemaining:'anthropic-ratelimit-output-tokens-remaining',
    outputTokensReset:    'anthropic-ratelimit-output-tokens-reset',
    requestId:            'request-id'
  },
  resetTimeFormat: 'iso8601',
  enabled: true
}
```

**Ollama config:**
```javascript
rateLimitHeaderConfig: {
  enabled: false
}
```

## Required Changes by File

### 1. New File: `lib/RateLimitHeaderParser.js`

Stateless utility class responsible for parsing raw HTTP response headers into the normalized `RateLimitInfo` schema.

**Public API:**
- `static parse(providerName, responseHeaders)` → `RateLimitInfo | null`
  - Looks up `rateLimitHeaderConfig` from `ProviderRegistry`
  - Returns `null` if config is `enabled: false` or no rate limit headers found
- `static parseDurationToMs(durationStr)` → `number`
  - Parses OpenAI-style duration strings (`"12ms"`, `"6s"`, `"1m30s"`) to milliseconds
- `static parseIso8601ToMs(isoStr)` → `number`
  - Parses ISO 8601 timestamp to ms-from-now (`Date.parse(value) - Date.now()`, floored at 0)

### 2. `lib/TokenBucket.js`

Add a new method that allows external callers to set both capacity and current remaining tokens without resetting the refill timer:

**New method:**
- `syncFromProvider({ capacity, remaining, resetMs })`
  - Sets `this.capacity = capacity` if provided
  - Sets `this.tokens = remaining` if provided (clamped to capacity)
  - If `resetMs` is provided and > 0, recalculates `this.refillRate` as `(capacity - remaining) / (resetMs / 1000)` — meaning the deficit refills over exactly the provider's reset window
  - Does **not** reset `this.lastRefill`

This is distinct from:
- `update()` — which resets tokens to full capacity (used for full config changes)
- `syncConfig()` — which adjusts capacity/rate but doesn't touch remaining (used for per-request config drift)

### 3. `lib/RateLimitManager.js`

Add a method that accepts normalized `RateLimitInfo` and syncs both buckets:

**New method:**
- `syncFromHeaders(rateLimitInfo)`
  - Calls `this.requestBucket.syncFromProvider(...)` with `rateLimitInfo.requests`
  - Calls `this.llmTokenBucket.syncFromProvider(...)` with `rateLimitInfo.tokens`
  - Only updates buckets for fields that are non-null in the `RateLimitInfo`

### 4. `lib/ResilientLLM.js` — `_makeHttpRequest()`

Return response headers alongside data and status code:

```javascript
// Before
return { data, statusCode: response?.status };

// After
const responseHeaders = {};
response?.headers?.forEach((value, key) => {
  responseHeaders[key] = value;
});
return { data, statusCode: response?.status, responseHeaders };
```

### 5. `lib/ResilientOperation.js` — `_executeBasic()`

After a successful response, parse headers and sync rate limits:

```javascript
const result = await asyncFn(...args);

// Parse rate limit headers from response (if available)
if (result?.responseHeaders) {
  const rateLimitInfo = RateLimitHeaderParser.parse(this.bucketId, result.responseHeaders);
  if (rateLimitInfo) {
    this.rateLimitManager.syncFromHeaders(rateLimitInfo);
    this.onRateLimitUpdate?.(rateLimitInfo);
  }
}
```

This replaces the existing `result.rateLimitInfo` check which was never populated.

### 6. `lib/ProviderRegistry.js`

- Add `rateLimitHeaderConfig` to each provider in `DEFAULT_PROVIDERS`
- Add a static accessor: `static getRateLimitHeaderConfig(providerName)` → returns the config or `null`

## Token Bucket Sync Strategy

The key challenge is correctly syncing the token bucket to the provider's actual state. The strategy differs by what data is available:

### When `remaining` and `resetMs` are both available (best case)

Set `tokens = remaining` and compute `refillRate = deficit / (resetMs / 1000)` where `deficit = capacity - remaining`. This ensures the bucket fully refills at exactly the time the provider's window resets.

### When only `remaining` is available

Set `tokens = remaining`. Keep the existing `refillRate`. The bucket will still refill at the previously configured rate.

### When only `limit` (capacity) is available

Update `capacity` and `refillRate` (as `limit / 60`). Do not change `tokens`. This is equivalent to what `syncConfig()` does today.

### When nothing is available

No-op. Static config remains in effect.

## Edge Cases

1. **First request with no prior config**: If the user provided no `rateLimitConfig` and the first response returns headers, the parser should populate the buckets from scratch. The default config (`requestsPerMinute: 10`) will be overridden by the provider's actual limits.

2. **Provider returns lower limits than configured**: The bucket capacity should decrease. If current `tokens > new capacity`, clamp tokens to new capacity.

3. **Provider returns 0 remaining**: Set `tokens = 0`. The bucket's refill mechanism will naturally restore tokens over time based on `refillRate` derived from `resetMs`.

4. **Reset time is in the past / negative**: Floor `resetMs` at 0. Treat as "already reset" — set tokens to capacity.

5. **Clock skew with ISO timestamps (Anthropic)**: Anthropic's reset timestamps are server-side. If `Date.parse(reset) - Date.now()` is negative due to clock skew, floor at 0 and treat as fully reset.

6. **Mixed provider switching**: When `ResilientLLM` falls back to an alternate provider, the `bucketId` changes to the new provider. Header parsing uses the new provider's config. Each provider maintains its own independent rate limit state.

7. **Headers object format**: `fetch()` returns a `Headers` object. `response.headers.get(key)` is case-insensitive. When converting to a plain object, normalize keys to lowercase.

8. **429 responses**: Even on 429 status codes, providers often return rate limit headers. These should still be parsed and synced. The library already handles 429 retry logic separately in `_shouldRetry()`.

## Backward Compatibility

1. **No breaking changes.** All new behavior is additive.
2. **Static config still works.** If a provider returns no rate limit headers, the static config from constructor/`llmOptions` remains in effect.
3. **`onRateLimitUpdate` callback**: Already exists in the constructor options. The callback will now fire with real `RateLimitInfo` objects instead of never being called.
4. **Existing `update()` and `syncConfig()` on `TokenBucket` / `RateLimitManager`** remain unchanged. The new `syncFromProvider()` / `syncFromHeaders()` methods are additive.

## Testing Requirements (Max 3 tests)

1. **Happy path**: `RateLimitHeaderParser.parse()` correctly parses OpenAI-style headers (duration reset format) into normalized `RateLimitInfo` with all fields populated.
2. **Edge case**: `RateLimitHeaderParser.parse()` correctly parses Anthropic-style headers (ISO 8601 reset format) including separate input/output token fields.
3. **Edge case**: `RateLimitHeaderParser.parse()` returns `null` when given headers from a provider with `rateLimitHeaderConfig.enabled: false` (Ollama) or when no recognized rate limit headers are present.

## Acceptance Criteria

1. After a successful OpenAI chat response, `RateLimitManager` request and token buckets reflect the `remaining` and `limit` values from the response headers.
2. After a successful Anthropic chat response, the token bucket reflects `anthropic-ratelimit-tokens-remaining` (total) rather than the static `llmTokensPerMinute` config.
3. If the provider returns no rate limit headers, the existing static config continues to work with zero behavioral change.
4. The `onRateLimitUpdate` callback fires with a normalized `RateLimitInfo` object after each successful response that contains rate limit headers.
5. Adding rate limit header support for a new provider requires only adding a `rateLimitHeaderConfig` object to `ProviderRegistry.DEFAULT_PROVIDERS` — no code changes in parser or bucket logic.
