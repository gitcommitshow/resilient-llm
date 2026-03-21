import type { OperationMetadata } from "./types.js";

/**
 * Stable error codes for consumer branching (`error.code`).
 *
 * Consumers can branch on `error.code` without importing this class:
 *
 *     if (error.name === "ResilientLLMError") {
 *       switch (error.code) { ... }
 *     }
 *
 * Or with an import for TypeScript narrowing:
 *
 *     if (error instanceof ResilientLLMError) {
 *       switch (error.code) { ... }
 *     }
 *
 * See `spec/error-handling.md` §6 for actionable consumer examples per code.
 */
export type ResilientLLMErrorCode =
    // Structured output / validation
    | "JSON_PARSE_ERROR"
    | "JSON_MODE_FAILURE"
    | "SCHEMA_MISMATCH"
    | "VALIDATION_ERROR"
    // Provider HTTP / API
    | "PROVIDER_BAD_REQUEST"
    | "PROVIDER_UNAUTHORIZED"
    | "PROVIDER_FORBIDDEN"
    | "PROVIDER_NOT_FOUND"
    | "PROVIDER_RATE_LIMIT"
    | "PROVIDER_INTERNAL_ERROR"
    | "PROVIDER_UNAVAILABLE"
    | "PROVIDER_OVERLOADED"
    | "PROVIDER_ERROR"
    // Resilience
    | "TIMEOUT"
    | "CIRCUIT_OPEN"
    | "RATE_LIMIT_EXHAUSTED"
    | "ABORTED"
    | "BULKHEAD_EXHAUSTED"
    // Configuration
    | "INVALID_PROVIDER"
    | "MISSING_CREDENTIALS"
    | "INVALID_MODEL"
    | "INVALID_REQUEST"
    // Capability
    | "UNSUPPORTED_FEATURE"
    // Catch-all
    | "UNKNOWN";

/** Retryable codes: a simple retry (with backoff) might succeed. */
const RETRYABLE_CODES = new Set<ResilientLLMErrorCode>([
    "PROVIDER_RATE_LIMIT",
    "PROVIDER_UNAVAILABLE",
    "PROVIDER_OVERLOADED",
    "ABORTED",
    "RATE_LIMIT_EXHAUSTED",
]);

/**
 * Single public error type for ResilientLLM.
 *
 * **When thrown:** After internal resilience is exhausted or not applicable: invalid
 * configuration, provider HTTP/API errors, structured output validation failures,
 * unsupported capabilities, and terminal resilience events (timeout, circuit open, abort).
 *
 * **When not thrown:** During transient retries inside `ResilientOperation`, for internal
 * programmer errors, or on success paths (use return values / metadata instead).
 *
 * **Handling without importing this class:**
 * - `error instanceof Error` + `error.message` always works.
 * - `error.name === "ResilientLLMError"` identifies library errors.
 * - `error.code` (string) drives branching (see {@link ResilientLLMErrorCode}).
 * - `error.retryable` hints if a simple retry might help.
 * - `error.cause` preserves the underlying technical error for logging.
 * - `error.metadata` mirrors `ChatResponse.metadata`—same operational surface on
 *   both success and failure—safe to forward to client apps for richer UX.
 */
export class ResilientLLMError extends Error {
    readonly code: ResilientLLMErrorCode;
    readonly retryable: boolean;
    readonly metadata: OperationMetadata | undefined;

    constructor(
        message: string,
        code: ResilientLLMErrorCode,
        options?: { cause?: unknown; metadata?: OperationMetadata; retryable?: boolean },
    ) {
        super(message, { cause: options?.cause });
        this.name = "ResilientLLMError";
        this.code = code;
        this.retryable = options?.retryable ?? RETRYABLE_CODES.has(code);
        this.metadata = options?.metadata;
    }
}
