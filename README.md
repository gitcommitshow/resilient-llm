# ResilientLLM

A robust LLM integration layer designed to ensure reliable, seamless interactions across multiple APIs by intelligently handling failures and rate limits.

## Motivation

ResilientLLM is a resilient, unified LLM interface featuring circuit breaker, token bucket rate limiting, caching, and adaptive retry with dynamic backoff support.

In 2023, I developed multiple AI Agents and LLM Apps. I chose to **not** use the complex tools like Langchain just to make a simple LLM API call. A simple class to encapsulate my LLM call (`llm.chat`) was enough for me. Each app was using different LLM and configurations. For every new project, I found myself copying the same LLM orchestration code with minor adjustments. With each new release of those projects, I added some bug-fixes and essential features this LLM orchestration code. It was a tiny class, so there was not a major problem in syncing back those improvements to other projects. Soon, I had a class that unified API calls to multiple LLMs in a single interface `unifiedLLM.chat(conversationHistory, llmOptions)`, it was working flawlessly, on my development machine.

When I deployed my AI agents on production, they started facing failures, some predictable (e.g. hitting LLM provider's rate limits), some unpredictable (Anthropic's overload error, network issues, CPU/memory spikes leading to server crash, etc.). Some of these issues were already dealt with a simple exponential backoff and retry strategy. But it was not good enough to put it out there on production. I could have put a rate limit gateway in front of my app server but that wouldn't have the enough user/app context/control to recover from these failures and leave the gap for unpredictable errors. Also it would have been an extra chore and expense to manage that gateway. So for the multiple agentic apps that I was creating, the LLM calls had to be more resilient, and the solution to deal with most of these failures had to be in the app itself.

Vercel AI SDK seemed to offer convenient and unified abstractions. It seemed to even follow a more structured approach than mine (Vercel has adapters for each LLM provider) which enables advanced use cases such as supporting multi-modal APIs out-of-the-box for many providers (for which adapters are created by Vercel). This was a good approach to allow more use cases than what my tiny LLM class was doing, but I wanted to make the interface more production-ready(resilient) and unified (support new LLM API for the same AI agent use cases - chat/tool-calls, etc.). Only after diving deeper, I understood that it does not focus on resilience except for a simple backoff/retry strategy similar to what I had. Langchain was still more complex than needed, and it didn't have everything I needed to make my LLM orchestration more robust.

The final solution was to extract tiny LLM orchestration class out of all my AI Agents and added circuit breakers, adaptive retries with backoff, and token bucket rate limiting while responding dynamically to API signals like retry-after headers. I used JavaScript/Node.js native features such as `AbortController` to bring control to abort on-demand or timeout.

This library solves my challenges in building production-ready AI Agents such as:
- unstable network conditions
- inconsistent error handling
- unpredictable LLM API rate limit errrors

This library aims to solve the same challenges for you by providing a resilient layer that intelligently manages failures and rate limits, enabling you (developers) to integrate LLMs confidently and effortlessly at scale.

## Quickstart

```
import ResilientLLM from 'resilient-llm';

const llm = new ResilientLLM({
  aiService: 'openai', // or 'anthropic', 'gemini', 'ollama'
  model: 'gpt-4o-mini',
  maxTokens: 2048,
  temperature: 0.7,
  rateLimitConfig: {
    requestsPerMinute: 60,      // Limit to 60 requests per minute
    llmTokensPerMinute: 90000   // Limit to 90,000 LLM tokens per minute
  }
});

const conversationHistory = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'What is the capital of France?' }
];

(async () => {
  try {
    const response = await llm.chat(conversationHistory);
    console.log('LLM response:', response);
  } catch (err) {
    console.error('Error:', err);
  }
})();
```

---

### Key Points

- **Rate limiting is automatic**: You don’t need to pass token counts or manage rate limits yourself.
- **Token estimation**: The number of LLM tokens is estimated for each request and enforced.
- **Retries, backoff, and circuit breaker**: All are handled internally by the `ResilientOperation`.

---

### Advanced: With Custom Options

```js
const response = await llm.chat(
  [
    { role: 'user', content: 'Summarize the plot of Inception.' }
  ],
  {
    maxTokens: 512,
    temperature: 0.5,
    aiService: 'anthropic', // override default
    model: 'claude-3-5-sonnet-20240620'
  }
);
```