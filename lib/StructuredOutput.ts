/**
 * Describes issues that might arise during validation of a JSON object
 * against a schema. Used for error reporting in structured response handling.
 * 
 * @example
 * {
 *   missingFields: ["id"],
 *   extraFields: ["unexpected"],
 *   typeMismatches: [{ field: "count", expected: "number", actual: "string" }]
 * }
 */
export interface SchemaValidationIssue {
    missingFields: string[]; // Keys required by the schema, but not present in the object.
    extraFields: string[];   // Keys present in the object but not allowed by the schema.
    typeMismatches: Array<{
        field: string;       // Which field mismatched.
        expected: string;    // Expected primitive type from schema.
        actual: string;      // Actual type in provided content.
    }>;
}

/**
 * Configuration for normalization and validation of a structured output
 * (before and after requesting an LLM).
 * 
 * @example
 * {
 *   responseFormat: { type: "json_object" },
 *   outputConfig: { format: ... },
 *   schema: { properties: ... },
 *   expectsJson: true
 * }
 */
export interface StructuredOutputConfig {
    responseFormat?: unknown;   // The normalized format definition (if supplied) for LLM output.
    outputConfig?: unknown;     // Provider-specific "output_config" wrapper, if applicable.
    schema: Record<string, unknown> | null; // Schema for post-parsing validation (or null).
    expectsJson: boolean;       // True if the LLM is expected to return a JSON object.
}

/**
 * Minimal request fields to include with outbound API requests to LLM providers.
 * Only one of these will be set, based on the provider/wrapper.
 * 
 * @example
 * { responseFormat: { type: 'json_object' } }
 * @example
 * { outputConfig: { format: { type: 'json_schema', ... } } }
 */
export interface StructuredRequestFields {
    responseFormat?: unknown;
    outputConfig?: unknown;
}

/**
 * All ways a caller may request structured outputs (configurable by client).
 * Accepts both camelCase and snake_case keys, and optionally wrappers.
 * 
 * @example
 * { responseFormat: { type: "json_object" } }
 * @example
 * { response_format: { type: "json_object" } }
 * @example
 * { outputConfig: { format: ... } }
 * @example
 * { output_config: { format: ... } }
 */
export interface StructuredOutputOptions {
    responseFormat?: unknown;
    response_format?: unknown;
    outputConfig?: unknown;
    output_config?: unknown;
}

/**
 * Return value when content was produced by a tool call, not as plain JSON or text.
 * Used for forwarding LLM tool results through the structured output interface.
 * 
 * @example
 * {
 *   content: null,
 *   toolCalls: [...]
 * }
 */
export interface StructuredToolCallResult {
    content: string | null;
    toolCalls: unknown;
}

/**
 * Acceptable parsed content output from an LLM (normalized or raw).
 * - Can be a string (unstructured text output)
 * - a parsed JSON object
 * - a structured tool call result object
 * - or null
 * 
 * @example
 * 'This is just a string'
 * @example
 * { name: "foo", value: 2 }
 * @example
 * { content: null, toolCalls: [...] }
 */
export type StructuredContent = string | Record<string, unknown> | StructuredToolCallResult | null;

/**
 * Custom error type for all structured output handling errors (e.g. parse, mismatch).
 * Contains the underlying erroneous response and optional schema validation issues.
 * 
 * @example
 * throw new StructuredOutputError('SCHEMA_MISMATCH', 'Fields missing', '{"foo":1}', { missingFields: ["bar"], ... })
 */
class StructuredOutputError extends Error {
    code: 'JSON_PARSE_ERROR' | 'JSON_MODE_FAILURE' | 'SCHEMA_MISMATCH'; // Type of failure.
    rawResponse: unknown;         // The raw offending content.
    validation: SchemaValidationIssue | null; // Optional validation explanation.

    constructor(
        code: 'JSON_PARSE_ERROR' | 'JSON_MODE_FAILURE' | 'SCHEMA_MISMATCH',
        message: string,
        rawResponse: unknown,
        validation: SchemaValidationIssue | null = null,
    ) {
        super(message);
        this.name = 'StructuredOutputError';
        this.code = code;
        this.rawResponse = rawResponse;
        this.validation = validation;
    }
}

/**
 * StructuredOutput is responsible for managing "format" and schema 
 * normalization for LLM API calls, and for parsing and validating 
 * returned output against schemas as needed.
 * 
 * Usage Example:
 * ```
 * const structured = StructuredOutput.fromInputs({ responseFormat: { type: "json_object" } });
 * const requestFields = structured.getRequestFields();
 * // Make API call...
 * const parsed = structured.parse(apiResponse);
 * ```
 */
export class StructuredOutput {
    readonly config: StructuredOutputConfig;
    private readonly source: StructuredOutputOptions;

    /**
     * Constructor is private—use StructuredOutput.fromInputs.
     * @param config Normalized config about how to structure requests and parse outputs.
     * @param source The original request options the user provided.
     */
    private constructor(config: StructuredOutputConfig, source: StructuredOutputOptions = {}) {
        this.config = config;
        this.source = source;
    }

    /**
     * Create a StructuredOutput from user/caller input.
     * Handles normalization and aliasing of possible config fields.
     * 
     * @param inputs Possibly ambiguous or aliased structured output options.
     * @returns StructuredOutput instance with normalized representation.
     * @example
     * StructuredOutput.fromInputs({ responseFormat: { type: "json_object" } })
     */
    static fromInputs(inputs: StructuredOutputOptions): StructuredOutput {
        StructuredOutput.assertNoAliasConflicts(inputs);
        // Accept camelCase and snake_case caller keys, including wrapper objects.
        const resolvedResponseFormat = StructuredOutput.resolveResponseFormatOption(
            inputs.responseFormat,
            inputs.response_format
        );
        const resolvedOutputConfig = StructuredOutput.resolveOutputConfigOption(
            inputs.responseFormat,
            inputs.response_format,
            inputs.outputConfig,
            inputs.output_config
        );

        if (typeof resolvedResponseFormat === 'string') {
            const normalized = resolvedResponseFormat.trim().toLowerCase();
            if (normalized === 'json' || normalized === 'object' || normalized === 'json_object') {
                return new StructuredOutput(
                    { responseFormat: { type: 'json_object' }, schema: null, expectsJson: true },
                    { responseFormat: { type: 'json_object' } }
                );
            }
            return new StructuredOutput({ schema: null, expectsJson: false }, { responseFormat: resolvedResponseFormat });
        }

        if (resolvedOutputConfig && typeof resolvedOutputConfig === 'object' && !Array.isArray(resolvedOutputConfig)) {
            const outputConfig = resolvedOutputConfig as Record<string, unknown>;
            const format = (outputConfig.format && typeof outputConfig.format === 'object' && !Array.isArray(outputConfig.format))
                ? outputConfig.format as Record<string, unknown>
                : null;
            const schema = format ? StructuredOutput.extractJsonSchema(format) : null;
            const expectsJson = format?.type === 'json_schema' || schema !== null;
            return new StructuredOutput(
                { outputConfig, schema, expectsJson },
                { outputConfig }
            );
        }

        if (!resolvedResponseFormat || typeof resolvedResponseFormat !== 'object' || Array.isArray(resolvedResponseFormat)) {
            return new StructuredOutput({ schema: null, expectsJson: false }, {});
        }

        const format = resolvedResponseFormat as Record<string, unknown>;
        if (format.type === 'json_object') {
            return new StructuredOutput({ responseFormat: format, schema: null, expectsJson: true }, { responseFormat: format });
        }

        const schema = StructuredOutput.extractJsonSchema(format);
        if (!schema) {
            return new StructuredOutput({
                responseFormat: format,
                schema: null,
                expectsJson: false,
            }, { responseFormat: format });
        }

        return new StructuredOutput({
            responseFormat: format,
            schema,
            expectsJson: true,
        }, { responseFormat: format });
    }

    getRequestFields(requestField: 'response_format' | 'output_config' = 'response_format'): StructuredRequestFields {
        if (requestField === 'output_config') {
            if (this.source.outputConfig !== undefined) {
                return { outputConfig: this.source.outputConfig };
            }
            const derivedOutputConfig = this.deriveOutputConfig();
            return derivedOutputConfig !== undefined ? { outputConfig: derivedOutputConfig } : {};
        }

        if (this.source.responseFormat !== undefined) {
            return { responseFormat: this.source.responseFormat };
        }
        const derivedResponseFormat = this.deriveResponseFormat();
        return derivedResponseFormat !== undefined ? { responseFormat: derivedResponseFormat } : {};
    }

    parse(content: StructuredContent): StructuredContent {
        if (!this.config.expectsJson) return content;
        if (StructuredOutput.isToolCallResult(content)) return content;

        const validated = (obj: Record<string, unknown>, raw: unknown): Record<string, unknown> => {
            if (!this.config.schema) return obj;
            const issues = StructuredOutput.validateAgainstSchema(obj, this.config.schema);
            if (issues) {
                throw new StructuredOutputError(
                    'SCHEMA_MISMATCH',
                    'Schema mismatch: response JSON does not match required fields/types',
                    raw,
                    issues
                );
            }
            return obj;
        };

        if (content && typeof content === 'object') {
            if (Array.isArray(content)) {
                throw new StructuredOutputError('JSON_MODE_FAILURE', 'JSON response must be an object', content);
            }
            return validated(content as Record<string, unknown>, content);
        }

        if (typeof content === 'string') {
            const parsed = StructuredOutput.normalizeJsonContent(content);
            return validated(parsed, content);
        }

        return content;
    }

    // Backward-compatible internal alias.
    normalize(content: StructuredContent): StructuredContent {
        return this.parse(content);
    }

    private static extractJsonSchema(format: Record<string, unknown>): Record<string, unknown> | null {
        if (format.type === 'json_schema' && 'json_schema' in format) {
            const wrapper = format.json_schema as Record<string, unknown> | undefined;
            if (wrapper?.schema && typeof wrapper.schema === 'object' && !Array.isArray(wrapper.schema)) {
                return wrapper.schema as Record<string, unknown>;
            }
        }
        if (format.type === 'json_schema' && format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema)) {
            return format.schema as Record<string, unknown>;
        }
        if (format.type === 'object' || 'properties' in format || 'required' in format) {
            return format;
        }
        if (format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema)) {
            return format.schema as Record<string, unknown>;
        }
        return null;
    }

    private static assertNoAliasConflicts(inputs: StructuredOutputOptions): void {
        if (inputs.responseFormat !== undefined && inputs.response_format !== undefined) {
            throw new Error('Provide either "responseFormat" or "response_format", not both.');
        }
        if (inputs.outputConfig !== undefined && inputs.output_config !== undefined) {
            throw new Error('Provide either "outputConfig" or "output_config", not both.');
        }
    }

    private static resolveResponseFormatOption(responseFormat: unknown, responseFormatAlias: unknown): unknown {
        if (responseFormatAlias !== undefined) {
            return responseFormatAlias;
        }
        if (responseFormat && typeof responseFormat === 'object' && !Array.isArray(responseFormat)) {
            const maybeWrapper = responseFormat as Record<string, unknown>;
            if (maybeWrapper.responseFormat !== undefined) {
                return maybeWrapper.responseFormat;
            }
            if (maybeWrapper.response_format !== undefined) {
                return maybeWrapper.response_format;
            }
        }
        return responseFormat;
    }

    private static resolveOutputConfigOption(
        responseFormat: unknown,
        responseFormatAlias: unknown,
        outputConfig: unknown,
        outputConfigAlias: unknown
    ): unknown {
        if (outputConfig !== undefined) {
            return outputConfig;
        }
        if (outputConfigAlias !== undefined) {
            return outputConfigAlias;
        }
        const wrappers = [responseFormat, responseFormatAlias];
        for (const wrapper of wrappers) {
            if (wrapper && typeof wrapper === 'object' && !Array.isArray(wrapper)) {
                const maybeWrapper = wrapper as Record<string, unknown>;
                if (maybeWrapper.outputConfig !== undefined) {
                    return maybeWrapper.outputConfig;
                }
                if (maybeWrapper.output_config !== undefined) {
                    return maybeWrapper.output_config;
                }
            }
        }
        return undefined;
    }

    private isJsonObjectFormat(value: unknown): boolean {
        return !!value
            && typeof value === 'object'
            && !Array.isArray(value)
            && (value as Record<string, unknown>).type === 'json_object';
    }

    private deriveOutputConfig(): unknown {
        if (this.config.outputConfig !== undefined) {
            return this.config.outputConfig;
        }

        if (this.config.responseFormat && this.isJsonObjectFormat(this.config.responseFormat)) {
            // No user-provided schema: do not invent a restrictive schema.
            // Providers that require schema-based structured config should receive no
            // structured request field here and rely on best-effort post parsing.
            return undefined;
        }

        if (this.config.schema) {
            return { format: { type: 'json_schema', schema: this.config.schema } };
        }

        return undefined;
    }

    private deriveResponseFormat(): unknown {
        if (this.config.responseFormat !== undefined) {
            return this.config.responseFormat;
        }

        if (this.source.outputConfig && typeof this.source.outputConfig === 'object' && !Array.isArray(this.source.outputConfig)) {
            const outputConfig = this.source.outputConfig as Record<string, unknown>;
            const format = (outputConfig.format && typeof outputConfig.format === 'object' && !Array.isArray(outputConfig.format))
                ? outputConfig.format as Record<string, unknown>
                : null;

            if (format?.type === 'json_object') {
                return { type: 'json_object' };
            }
            if (format?.type === 'json_schema' && format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema)) {
                return {
                    type: 'json_schema',
                    json_schema: { name: 'structured_response', schema: format.schema },
                };
            }
        }

        if (this.config.schema) {
            return {
                type: 'json_schema',
                json_schema: { name: 'structured_response', schema: this.config.schema },
            };
        }

        return undefined;
    }

    private static normalizeJsonContent(content: string): Record<string, unknown> {
        let parsed: unknown = null;
        const candidates = StructuredOutput.buildJsonParseCandidates(content);
        for (const candidate of candidates) {
            try {
                parsed = JSON.parse(candidate);
                break;
            } catch {
                // Try next parse candidate.
            }
        }
        if (parsed === null) {
            throw new StructuredOutputError('JSON_PARSE_ERROR', 'JSON parse failed for structured response', content);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new StructuredOutputError('JSON_MODE_FAILURE', 'JSON response must be an object', content);
        }
        return parsed as Record<string, unknown>;
    }

    private static buildJsonParseCandidates(content: string): string[] {
        const candidates: string[] = [];
        const trimmed = content.trim();
        if (!trimmed) return candidates;

        candidates.push(trimmed);

        // Common LLM output shape: fenced markdown JSON block.
        const fullFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        if (fullFenceMatch?.[1]) {
            candidates.push(fullFenceMatch[1].trim());
        }

        // Fallback: first fenced block embedded in additional prose.
        const embeddedFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (embeddedFenceMatch?.[1]) {
            candidates.push(embeddedFenceMatch[1].trim());
        }

        return Array.from(new Set(candidates));
    }

    private static validateAgainstSchema(data: Record<string, unknown>, schema: Record<string, unknown>): SchemaValidationIssue | null {
        const required = Array.isArray(schema.required)
            ? schema.required.filter((r): r is string => typeof r === 'string')
            : [];
        const properties = (schema.properties && typeof schema.properties === 'object')
            ? schema.properties as Record<string, Record<string, unknown>>
            : {};

        const missingFields = required.filter(field => !(field in data));
        const extraFields = (schema.additionalProperties === false && Object.keys(properties).length > 0)
            ? Object.keys(data).filter(key => !(key in properties))
            : [];

        const typeMismatches: SchemaValidationIssue['typeMismatches'] = [];
        for (const [field, fieldSchema] of Object.entries(properties)) {
            if (!(field in data) || !fieldSchema || typeof fieldSchema !== 'object') continue;
            const expected = StructuredOutput.schemaPrimitiveType(fieldSchema);
            if (!expected) continue;
            const actual = StructuredOutput.runtimePrimitiveType(data[field]);
            if (actual !== expected && !(expected === 'number' && actual === 'integer')) {
                typeMismatches.push({ field, expected, actual });
            }
        }

        if (missingFields.length === 0 && extraFields.length === 0 && typeMismatches.length === 0) {
            return null;
        }
        return { missingFields, extraFields, typeMismatches };
    }

    private static schemaPrimitiveType(fieldSchema: Record<string, unknown>): string | null {
        const t = fieldSchema.type;
        const resolved = Array.isArray(t) ? t[0] : t;
        return (resolved === 'string' || resolved === 'number' || resolved === 'boolean' || resolved === 'integer')
            ? resolved as string
            : null;
    }

    private static runtimePrimitiveType(value: unknown): string {
        if (typeof value === 'string') return 'string';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object') return 'object';
        return typeof value;
    }

    private static isToolCallResult(value: unknown): value is StructuredToolCallResult {
        return !!value && typeof value === 'object' && 'toolCalls' in value;
    }
}
