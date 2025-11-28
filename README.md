# Resilient LLM
[![npm version](https://img.shields.io/npm/v/resilient-llm.svg)](https://www.npmjs.com/package/resilient-llm) [![license](https://img.shields.io/npm/l/resilient-llm.svg)](LICENSE)

A minimalist but robust LLM integration layer designed to ensure reliable, seamless interactions across multiple LLM providers by intelligently handling failures and rate limits.

![banner](./banner.png)

ResilientLLM makes your AI Agents or LLM apps production-ready by dealing with challenges such as:

- ❌ Unstable network conditions
- ⚠️ Inconsistent errors
- ⏳ Unpredictable LLM API rate limit errors

Check out [examples](./examples/), ready to ship.

### Key Features

- **Token Estimation**: You don’t need to calculate LLM tokens, they are estimated for each request
- **Rate Limiting**: You don't need to manage the token bucket rate algorithm yourself to follow the rate limits by LLM service providers, it is done for you automatically
- **Retries, Backoff, and Circuit Breaker**: All are handled internally by the `ResilientOperation`

## Installation

```bash
npm i resilient-llm
```

## Quickstart

```javascript
import { ResilientLLM } from 'resilient-llm';

const llm = new ResilientLLM({
  aiService: 'openai', // or 'anthropic', 'gemini', 'ollama'
  model: 'gpt-4o-mini',
  maxTokens: 2048,
  temperature: 0.7,
  rateLimitConfig: {
    requestsPerMinute: 60,      // Limit to 60 requests per minute
    llmTokensPerMinute: 90000   // Limit to 90,000 LLM tokens per minute
  },
  retries: 3, // Number of times to retry when req. fails and only if it is possible to fix by retry
  backoffFactor: 2 // Increase delay between retries by this factor
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

## Examples and playground

Complete working projects using Resilient LLM as core library to call LLM APIs with resilience.

- [Minimal AI Chat](./examples/chat-basic/)

## Motivation

ResilientLLM is a resilient, unified LLM interface featuring circuit breaker, token bucket rate limiting, caching, and adaptive retry with dynamic backoff support.

In 2023, I developed multiple AI Agents and LLM Apps. I chose to **not** use the complex tools like Langchain just to make a simple LLM API call. A simple class to encapsulate my LLM call (`llm.chat`) was enough for me. Each app was using different LLM and configurations. For every new project, I found myself copying the same LLM orchestration code with minor adjustments. With each new release of those projects, I added some bug-fixes and essential features this LLM orchestration code. It was a tiny class, so there was not a major problem in syncing back those improvements to other projects. Soon, I had a class that unified API calls to multiple LLMs in a single interface `unifiedLLM.chat(conversationHistory, llmOptions)`, it was working flawlessly, on my development machine.

When I deployed my AI agents on production, they started facing failures, some predictable (e.g. hitting LLM provider's rate limits), some unpredictable (Anthropic's overload error, network issues, CPU/memory spikes leading to server crash, etc.). Some of these issues were already dealt with a simple exponential backoff and retry strategy. But it was not good enough to put it out there on production. I could have put a rate limit gateway in front of my app server but that wouldn't have the enough user/app context/control to recover from these failures and leave the gap for unpredictable errors. Also it would have been an extra chore and expense to manage that gateway. So for the multiple agentic apps that I was creating, the LLM calls had to be more resilient, and the solution to deal with most of these failures had to be in the app itself.

Vercel AI SDK seemed to offer convenient and unified abstractions. It seemed to even follow a more structured approach than mine (Vercel has adapters for each LLM provider) which enables advanced use cases such as supporting multi-modal APIs out-of-the-box for many providers (for which adapters are created by Vercel). This was a good approach to allow more use cases than what my tiny LLM class was doing, but I wanted to make the interface more production-ready(resilient) and unified (support new LLM API for the same AI agent use cases - chat/tool-calls, etc.). Only after diving deeper, I understood that it does not focus on resilience except for a simple backoff/retry strategy similar to what I had. Langchain was still more complex than needed, and it didn't have everything I needed to make my LLM orchestration more robust.

The final solution was to extract tiny LLM orchestration class out of all my AI Agents and added circuit breakers, adaptive retries with backoff, and token bucket rate limiting while responding dynamically to API signals like retry-after headers. I used JavaScript/Node.js native features such as `AbortController` to bring control to abort on-demand or timeout.

This library solves my challenges in building production-ready AI Agents such as:
- unstable network conditions
- inconsistent error handling
- unpredictable LLM API rate limit errors

This library aims to solve the same challenges for you by providing a resilient layer that intelligently manages failures and rate limits, enabling you (developers) to integrate LLMs confidently and effortlessly at scale.

## Scope

### What's in scope

- **Unified LLM Interface**: Simple, consistent API across multiple LLM providers (OpenAI, Anthropic, Google Gemini, Ollama)
- **Resilience Features**: Circuit breakers, adaptive retries with exponential backoff, and intelligent failure recovery
- **Rate Limiting**: Token bucket rate limiting with automatic token estimation and enforcement
- **Production Readiness**: Handling of network issues, API rate limits, timeouts, and server overload scenarios
- **Basic Chat Functionality**: Support for conversational chat interfaces and message history
- **Request Control**: AbortController support for on-demand request cancellation and timeouts
- **Error Recovery**: Dynamic response to API signals like retry-after headers and provider-specific error codes

### What's not in scope

- **Complex LLM Orchestration**: Advanced workflows, chains, or multi-step LLM interactions (use LangChain or similar for complex use cases)
- **Multi-modal Support**: Image, audio, or video processing capabilities
- **Tool/Function Calling**: Advanced function calling or tool integration features
- **Streaming Responses**: Real-time streaming of LLM responses
- **Vector Databases**: Embedding storage, similarity search, or RAG (Retrieval-Augmented Generation) capabilities
- **Fine-tuning or Training**: Model training, fine-tuning, or custom model deployment
- **UI Components**: Frontend widgets, chat interfaces, or user interface elements
- **Data Processing Pipelines**: ETL processes, data transformation, or batch processing workflows

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.