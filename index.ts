import ResilientLLM from "./lib/ResilientLLM.js";
import ProviderRegistry from "./lib/ProviderRegistry.js";
import { StructuredOutput } from "./lib/StructuredOutput.js";

export {
    ResilientLLM,
    ProviderRegistry,
    StructuredOutput,
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
} from "./lib/ResilientLLM.js";

export type {
    StructuredOutputConfig,
    StructuredOutputOptions as StructuredOutputInputs,
    StructuredRequestFields,
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
