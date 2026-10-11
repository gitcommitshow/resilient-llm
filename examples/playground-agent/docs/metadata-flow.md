# Backend activity metadata - flow and retrieval

This doc describes how operation metadata (including tokens/usage) is produced, sent, stored, and shown in the playground.

## 1. Production (ResilientLLM library)

- The library builds a **metadata** object at the start of the call (requestId, config, events, timing, retries, rateLimiting, etc.).
- After the HTTP call completes, it fills in runtime fields (retries, cache, circuitBreaker, timing.totalTimeMs, etc.) and **usage** (prompt_tokens, completion_tokens, total_tokens) from the provider response `data.usage`.
- It returns `{ content, toolCalls?, metadata }` (same object reference; no copy).

So **usage lives on `metadata.usage`** and is always set when returning operation metadata (values may be null if the API didn’t report them).

## 2. Server (playground-agent server)

- **Endpoint:** `POST /api/chat`
- **Flow:**
  - Calls `llm.chat(conversationHistory, llmOptions)`.
  - Destructures `{ content, toolCalls?, metadata }` and forwards them in the JSON body (same shape as `llm.chat()` plus `success: true`).
  - Sends: `res.json({ success: true, content, ...(toolCalls !== undefined ? { toolCalls } : {}), metadata })`.
- **Important:** The server does **not** filter or reshape `metadata`. Whatever the library returns (including `metadata.usage`) is what gets sent.
- If the server is not using the local linked package (e.g. you run `npm run dev` from inside `examples/playground-agent` without linking), it will use the published npm package, which may not include `metadata.usage`. A warning is logged when metadata is present but `metadata.usage` is missing.

## 3. Client – processing and storage (AppContext)

- **Send message**
  - After `fetch('/api/chat', ...)`, the client does `const data = await response.json()`.
  - It builds: `const meta = data.metadata ? { operation: data.metadata } : undefined`.
  - So **the whole server `metadata` object is stored under `operation`**; no picking or omitting.
  - It then calls `addMessage(text, 'assistant', meta)`.

- **addMessage**
  - Builds the new message as: `{ id, text, role, timestamp, ...(meta && { metadata: meta }) }`.
  - So the stored message has `message.metadata = { operation: data.metadata }`, i.e. **`message.metadata.operation` is the exact metadata object** the server sent (same shape; reference is lost after JSON round-trip, but all keys are preserved).

- **Regenerate**
  - On regenerate, the updated message is set with `metadata: data.metadata ? { ...(m.metadata || {}), operation: data.metadata } : m.metadata`.
  - So again the full `data.metadata` (including `usage`) is stored under `message.metadata.operation`.

- **Persistence**
  - Conversations are saved with `all[idx].messages = messages`. Messages are stored as-is; no stripping of `metadata` or `metadata.operation`. Loading just does `setMessages(loadedMessages)`.

So **storage and retrieval do not remove or transform `metadata.operation`**. If the server sends `metadata.usage`, it will be present in `message.metadata.operation.usage` after storage and load.

## 4. Retrieval and display (BackendActivityPanel)

- **Source of truth:** `backendActivity = selectedMessage?.metadata?.operation ?? null`.
- **Summary cards:** The panel destructures `backendActivity` (timing, retries, rateLimiting, service, cache, events, config, http, **usage**) and renders summary cards. Token cards (Total tokens, Prompt tokens, Output tokens) are shown when `usage` exists and has at least one non-null value.
- **Raw JSON:** The “Raw metadata (JSON)” section is `JSON.stringify(backendActivity, null, 2)`. So the raw block is exactly **what is stored in `message.metadata.operation`** – no extra filtering or shaping.

So **if `usage` is missing from the raw metadata in the panel, it was already missing from `message.metadata.operation`**, which means either:

1. The server never sent it (library not returning `metadata.usage` – e.g. server using an older npm build instead of the local linked package), or  
2. The message was created before the change that added `metadata.usage` (e.g. old conversation or no restart after updating the library).

## 5. Quick checklist

- Run the playground from the **repo root**: `npm run playground:agent` (so that `npm link resilient-llm` uses the local package).
- **Restart** the dev server after pulling or changing the library so it loads the version that sets `metadata.usage`.
- Send a **new** message (or regenerate one) after the restart; old messages keep the metadata they were stored with.
- If the server logs the warning about missing `metadata.usage`, the server is not using a build that adds usage to metadata.
