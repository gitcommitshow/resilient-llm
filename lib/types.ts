/** Metadata about an LLM operation, returned on both success and failure paths. */
export interface OperationMetadata {
    requestId?: string | null;
    operationId?: string;
    startTime?: number | null;
    /** LLM finish reason semantics (e.g. `stop`, `tool_calls`, `length`). */
    finishReason?: string | null;
    config?: Record<string, unknown>;
    events?: unknown[];
    timing?: { totalTimeMs?: number | null; rateLimitWaitMs?: number; httpRequestMs?: number | null };
    retries?: unknown[];
    rateLimiting?: { requestedTokens?: number; totalWaitMs?: number };
    circuitBreaker?: Record<string, unknown>;
    http?: Record<string, unknown>;
    cache?: Record<string, unknown>;
    service?: { attempted?: string[]; final?: string };
    usage?: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null };
    [key: string]: unknown;
}
