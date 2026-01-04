import { NextRequest, NextResponse } from 'next/server';
import { ResilientLLM } from 'resilient-llm';

// Store LLM instances per service for reuse
const llmInstances: Record<string, ResilientLLM> = {};

function getLLMInstance(aiService: string, model: string, config: {
  maxTokens?: number;
  temperature?: number;
  rateLimitConfig?: { requestsPerMinute: number; llmTokensPerMinute: number };
  retries?: number;
  backoffFactor?: number;
  chaosMode?: boolean;
}) {
  const key = `${aiService}-${model}`;

  if (!llmInstances[key]) {
    llmInstances[key] = new ResilientLLM({
      aiService,
      model,
      maxTokens: config.maxTokens || 2048,
      temperature: config.temperature || 0.7,
      rateLimitConfig: config.rateLimitConfig || {
        requestsPerMinute: 60,
        llmTokensPerMinute: 90000
      },
      retries: config.retries || 3,
      backoffFactor: config.backoffFactor || 2
    });
  }

  return llmInstances[key];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const resilienceLog: Array<{ type: string; message: string; timestamp: number }> = [];

  try {
    const body = await request.json();
    const {
      messages,
      aiService = 'openai',
      model,
      apiKey,
      maxTokens = 2048,
      temperature = 0.7,
      chaosMode = false,
      chaosConfig = {}
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'messages is required and must be an array' },
        { status: 400 }
      );
    }

    // Get the appropriate model for the service
    const defaultModels: Record<string, string> = {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20240620',
      gemini: 'gemini-2.0-flash',
      ollama: 'llama3.1:8b'
    };

    const selectedModel = model || defaultModels[aiService] || 'gpt-4o-mini';

    resilienceLog.push({
      type: 'info',
      message: `Initiating request to ${aiService} (${selectedModel})`,
      timestamp: Date.now() - startTime
    });

    // Chaos mode: simulate failures
    if (chaosMode) {
      const { failureRate = 0.5, delayMs = 0, simulateRateLimit = false } = chaosConfig;

      // Random delay
      if (delayMs > 0) {
        const actualDelay = Math.random() * delayMs;
        resilienceLog.push({
          type: 'chaos',
          message: `Chaos mode: Adding ${Math.round(actualDelay)}ms delay`,
          timestamp: Date.now() - startTime
        });
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }

      // Simulate rate limit
      if (simulateRateLimit && Math.random() < 0.3) {
        resilienceLog.push({
          type: 'chaos',
          message: 'Chaos mode: Simulating rate limit (429)',
          timestamp: Date.now() - startTime
        });
        return NextResponse.json({
          error: 'Rate limit exceeded (simulated)',
          resilienceLog,
          chaosTriggered: true
        }, { status: 429 });
      }

      // Random failure
      if (Math.random() < failureRate) {
        resilienceLog.push({
          type: 'chaos',
          message: `Chaos mode: Triggering random failure (${Math.round(failureRate * 100)}% chance)`,
          timestamp: Date.now() - startTime
        });
        return NextResponse.json({
          error: 'Random failure triggered by chaos mode',
          resilienceLog,
          chaosTriggered: true
        }, { status: 500 });
      }
    }

    // Create LLM instance
    const llm = getLLMInstance(aiService, selectedModel, {
      maxTokens,
      temperature,
      retries: 3,
      backoffFactor: 2
    });

    // Override API key if provided
    if (apiKey) {
      const originalGetApiKey = llm.getApiKey.bind(llm);
      llm.getApiKey = (service: string) => {
        if (service === aiService) return apiKey;
        return originalGetApiKey(service);
      };
    }

    resilienceLog.push({
      type: 'info',
      message: 'Sending request via ResilientLLM',
      timestamp: Date.now() - startTime
    });

    // Make the chat request
    const response = await llm.chat(messages, {
      aiService,
      model: selectedModel,
      maxTokens,
      temperature
    });

    const totalTime = Date.now() - startTime;

    resilienceLog.push({
      type: 'success',
      message: `Response received in ${totalTime}ms`,
      timestamp: totalTime
    });

    return NextResponse.json({
      response,
      resilienceLog,
      metrics: {
        totalTime,
        service: aiService,
        model: selectedModel,
        tokensEstimated: messages.reduce((acc: number, m: { content?: string }) =>
          acc + (m.content?.length || 0) / 4, 0
        )
      }
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    resilienceLog.push({
      type: 'error',
      message: `Error after ${totalTime}ms: ${errorMessage}`,
      timestamp: totalTime
    });

    // Check if it's a recoverable error that ResilientLLM would retry
    const isRetryable = errorMessage.includes('rate limit') ||
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('overloaded');

    return NextResponse.json({
      error: errorMessage,
      resilienceLog,
      metrics: {
        totalTime,
        isRetryable
      }
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    availableServices: ['openai', 'anthropic', 'gemini', 'ollama'],
    defaultModels: {
      openai: 'gpt-4o-mini',
      anthropic: 'claude-3-5-sonnet-20240620',
      gemini: 'gemini-2.0-flash',
      ollama: 'llama3.1:8b'
    }
  });
}
