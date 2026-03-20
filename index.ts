import ResilientLLM from "./lib/ResilientLLM.js";
import ProviderRegistry from "./lib/ProviderRegistry.js";
import {
    StructuredOutputError,
} from "./lib/StructuredOutput.js";

export {
    ResilientLLM,
    ProviderRegistry,
    StructuredOutputError
};

export type {
    ChatMessage,
    ResilientLLMOptions,
    LLMOptions,
    ToolDefinition,
    ObservabilityOptions,
    OperationMetadata,
    ChatResponseWithMetadata,
    ChatToolCallResult,
    SchemaValidationIssue,
    StructuredOutputErrorInfo,
} from "./lib/ResilientLLM.js";

export type {
    ParseMode,
    ValidationMode,
    StructuredOutputResult,
    StructuredOutputErrorCode,
    StructuredOutputErrorInfo as StructuredOutputErrorDetail,
    NormalizedStructuredOutputConfig,
    StructuredRequestFields,
    ResponseEnvelope,
    StructuredContent,
} from "./lib/StructuredOutput.js";

export type {
    AuthConfig,
    ParseConfig,
    ChatConfig,
    ProviderConfig,
    ConfigureInput,
    UnifiedModel,
    ListOptions,
} from "./lib/ProviderRegistry.js";

export type {
    ResilientOperationConfig,
    RuntimeMetrics,
} from "./lib/ResilientOperation.js";

export type {
    RateLimitConfig,
} from "./lib/RateLimitManager.js";

export type {
    CircuitBreakerConfig,
    CircuitBreakerStatus,
} from "./lib/CircuitBreaker.js";

export type {
    TokenBucketConfig,
} from "./lib/TokenBucket.js";
