// ─── Policy Types ────────────────────────────────────────────────────────

export type ParseMode = 'off' | 'best_effort' | 'strict_json';
export type ValidationMode = 'off' | 'shallow' | 'schema_strict';

// ─── Result Type ─────────────────────────────────────────────────────────

export type StructuredOutputResult<T, E = StructuredOutputErrorInfo> =
    | { ok: true; data: T }
    | { ok: false; data?: T; error: E };

// ─── Schema Validation ───────────────────────────────────────────────────

export interface SchemaValidationIssue {
    missingFields: string[];
    extraFields: string[];
    typeMismatches: Array<{
        field: string;
        expected: string;
        actual: string;
    }>;
}

// ─── Error DTO ───────────────────────────────────────────────────────────

export type StructuredOutputErrorCode =
    | 'JSON_PARSE_ERROR'
    | 'JSON_MODE_FAILURE'
    | 'SCHEMA_MISMATCH';

export interface StructuredOutputErrorInfo {
    code: StructuredOutputErrorCode;
    message: string;
    rawResponse: unknown;
    validation: SchemaValidationIssue | null;
}

/**
 * Throwable error for structured output failures.
 * Created at the ResilientLLM.chat() boundary from a Result error DTO.
 */
export class StructuredOutputError extends Error {
    code: StructuredOutputErrorCode;
    rawResponse: unknown;
    validation: SchemaValidationIssue | null;

    constructor(info: StructuredOutputErrorInfo) {
        super(info.message);
        this.name = 'StructuredOutputError';
        this.code = info.code;
        this.rawResponse = info.rawResponse;
        this.validation = info.validation;
    }
}

// ─── Normalized Config ───────────────────────────────────────────────────

export interface NormalizedStructuredOutputConfig {
    expectsJson: boolean;
    schema: Record<string, unknown> | null;
    schemaName: string;
    parseMode: ParseMode;
    validationMode: ValidationMode;
    /** Preserved original output_config for migration passthrough. */
    _outputConfig?: unknown;
    _source: 'responseFormat' | 'output_config' | 'none';
}

// ─── Request Fields ──────────────────────────────────────────────────────

export interface StructuredRequestFields {
    response_format?: unknown;
    output_config?: unknown;
}

// ─── Response Envelope ───────────────────────────────────────────────────

export interface ResponseEnvelope {
    content: string | null;
    toolCalls?: unknown;
    finishReason?: string | null;
}

// ─── Structured Content ──────────────────────────────────────────────────

export type StructuredContent =
    | string
    | Record<string, unknown>
    | ResponseEnvelope
    | null;

// ═══════════════════════════════════════════════════════════════════════════
// 1. NORMALIZE
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_DEFAULTS: NormalizedStructuredOutputConfig = {
    expectsJson: false,
    schema: null,
    schemaName: 'structured_response',
    parseMode: 'off',
    validationMode: 'off',
    _source: 'none',
};

/**
 * Normalizes caller-provided structured output options into a canonical config.
 *
 * @param responseFormat - Recommended public input (string alias, object, or schema).
 * @param outputConfigMigration - Migration input for callers transitioning from provider-native APIs.
 *   When both are provided, responseFormat takes precedence.
 * @example
 * const result = normalizeStructuredOutputConfig("json", );
 * // result = { ok: true, data: NormalizedStructuredOutputConfig }
 */
export function normalizeStructuredOutputConfig(
    responseFormat?: unknown,
    outputConfigMigration?: unknown,
): StructuredOutputResult<NormalizedStructuredOutputConfig> {
    if (responseFormat === undefined && outputConfigMigration === undefined) {
        return { ok: true, data: CONFIG_DEFAULTS };
    }

    if (outputConfigMigration !== undefined && responseFormat === undefined) {
        return normalizeFromOutputConfig(outputConfigMigration);
    }

    if (typeof responseFormat === 'string') {
        return normalizeFromStringAlias(responseFormat);
    }

    if (responseFormat && typeof responseFormat === 'object' && !Array.isArray(responseFormat)) {
        return normalizeFromObjectFormat(responseFormat as Record<string, unknown>);
    }

    return { ok: true, data: CONFIG_DEFAULTS };
}

function normalizeFromStringAlias(
    alias: string,
): StructuredOutputResult<NormalizedStructuredOutputConfig> {
    const normalized = alias.trim().toLowerCase();
    if (normalized === 'json' || normalized === 'object' || normalized === 'json_object') {
        return {
            ok: true,
            data: {
                ...CONFIG_DEFAULTS,
                expectsJson: true,
                parseMode: 'best_effort',
                _source: 'responseFormat',
            },
        };
    }
    return { ok: true, data: { ...CONFIG_DEFAULTS, _source: 'responseFormat' } };
}

function normalizeFromObjectFormat(
    format: Record<string, unknown>,
): StructuredOutputResult<NormalizedStructuredOutputConfig> {
    const userParseMode = typeof format.parse === 'string'
        ? format.parse as ParseMode
        : undefined;
    const userValidateMode = typeof format.validate === 'string'
        ? format.validate as ValidationMode
        : undefined;

    if (format.type === 'json_object') {
        return {
            ok: true,
            data: {
                ...CONFIG_DEFAULTS,
                expectsJson: true,
                parseMode: userParseMode ?? 'best_effort',
                validationMode: userValidateMode ?? 'off',
                _source: 'responseFormat',
            },
        };
    }

    const schema = extractJsonSchema(format);
    if (schema || format.type === 'json_schema') {
        return {
            ok: true,
            data: {
                ...CONFIG_DEFAULTS,
                expectsJson: true,
                schema,
                schemaName: (format.schemaName as string)
                    || (format.name as string)
                    || extractSchemaName(format)
                    || CONFIG_DEFAULTS.schemaName,
                parseMode: userParseMode ?? 'best_effort',
                validationMode: userValidateMode ?? (schema ? 'shallow' : 'off'),
                _source: 'responseFormat',
            },
        };
    }

    // Bare schema object passed directly (has properties or required)
    if ('properties' in format || 'required' in format) {
        return {
            ok: true,
            data: {
                ...CONFIG_DEFAULTS,
                expectsJson: true,
                schema: format,
                parseMode: userParseMode ?? 'best_effort',
                validationMode: userValidateMode ?? 'shallow',
                _source: 'responseFormat',
            },
        };
    }

    return {
        ok: true,
        data: {
            ...CONFIG_DEFAULTS,
            parseMode: userParseMode ?? 'off',
            validationMode: userValidateMode ?? 'off',
            _source: 'responseFormat',
        },
    };
}

function normalizeFromOutputConfig(
    outputConfig: unknown,
): StructuredOutputResult<NormalizedStructuredOutputConfig> {
    if (typeof outputConfig !== 'object' || outputConfig === null || Array.isArray(outputConfig)) {
        return {
            ok: true,
            data: { ...CONFIG_DEFAULTS, _outputConfig: outputConfig, _source: 'output_config' },
        };
    }

    const oc = outputConfig as Record<string, unknown>;
    const format = (oc.format && typeof oc.format === 'object' && !Array.isArray(oc.format))
        ? oc.format as Record<string, unknown>
        : null;
    const schema = format ? extractJsonSchema(format) : null;
    const expectsJson = format?.type === 'json_schema' || schema !== null;

    return {
        ok: true,
        data: {
            ...CONFIG_DEFAULTS,
            expectsJson,
            schema,
            parseMode: expectsJson ? 'best_effort' : 'off',
            validationMode: schema ? 'shallow' : 'off',
            _outputConfig: outputConfig,
            _source: 'output_config',
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MAP TO PROVIDER REQUEST FIELDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps a normalized config to provider-native request body fields.
 *
 * @param config - Canonical structured output config from normalizeStructuredOutputConfig.
 * @param requestField - Which provider field to target (from ProviderRegistry chatConfig).
 */
export function mapConfigToRequestFields(
    config: NormalizedStructuredOutputConfig,
    requestField: 'response_format' | 'output_config',
): StructuredRequestFields {
    if (config._source === 'none') return {};

    if (requestField === 'output_config') {
        if (config._outputConfig !== undefined) {
            return { output_config: config._outputConfig };
        }
        return deriveOutputConfig(config);
    }

    return deriveResponseFormat(config);
}

function deriveOutputConfig(config: NormalizedStructuredOutputConfig): StructuredRequestFields {
    // json_object mode without schema: Anthropic doesn't support this natively.
    // Rely on best-effort post-parsing instead.
    if (config.expectsJson && !config.schema) {
        return {};
    }
    if (config.schema) {
        return {
            output_config: { format: { type: 'json_schema', schema: config.schema } },
        };
    }
    return {};
}

function deriveResponseFormat(config: NormalizedStructuredOutputConfig): StructuredRequestFields {
    if (config.expectsJson && !config.schema) {
        return { response_format: { type: 'json_object' } };
    }
    if (config.schema) {
        return {
            response_format: {
                type: 'json_schema',
                json_schema: { name: config.schemaName, schema: config.schema },
            },
        };
    }
    return {};
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PARSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Parses a response envelope into structured content.
 * Tool-call envelopes pass through unchanged.
 * JSON content is extracted from raw strings, including markdown-fenced blocks.
 */
export function parseStructuredResponse(
    envelope: ResponseEnvelope,
    config: NormalizedStructuredOutputConfig,
): StructuredOutputResult<StructuredContent> {
    if (envelope.toolCalls) {
        return { ok: true, data: envelope };
    }

    if (!config.expectsJson || config.parseMode === 'off') {
        return { ok: true, data: envelope.content };
    }

    const content = envelope.content;
    if (typeof content !== 'string' || !content.trim()) {
        return { ok: true, data: content };
    }

    const candidates = buildJsonParseCandidates(content);
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { ok: true, data: parsed as Record<string, unknown> };
            }
            if (Array.isArray(parsed)) {
                return {
                    ok: false,
                    error: {
                        code: 'JSON_MODE_FAILURE',
                        message: 'JSON response must be an object',
                        rawResponse: content,
                        validation: null,
                    },
                };
            }
        } catch {
            // try next candidate
        }
    }

    return {
        ok: false,
        error: {
            code: 'JSON_PARSE_ERROR',
            message: 'JSON parse failed for structured response',
            rawResponse: content,
            validation: null,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VALIDATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates a parsed JSON object against the expected schema from the normalized config.
 * Returns the object unchanged on success, or an error DTO on mismatch.
 */
export function validateStructuredResponse(
    parsedContent: Record<string, unknown>,
    config: NormalizedStructuredOutputConfig,
): StructuredOutputResult<Record<string, unknown>> {
    if (config.validationMode === 'off' || !config.schema) {
        return { ok: true, data: parsedContent };
    }

    const issues = validateAgainstSchema(parsedContent, config.schema);
    if (!issues) {
        return { ok: true, data: parsedContent };
    }

    return {
        ok: false,
        data: parsedContent,
        error: {
            code: 'SCHEMA_MISMATCH',
            message: 'Schema mismatch: response JSON does not match required fields/types',
            rawResponse: parsedContent,
            validation: issues,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function extractJsonSchema(format: Record<string, unknown>): Record<string, unknown> | null {
    if (format.type === 'json_schema' && 'json_schema' in format) {
        const wrapper = format.json_schema as Record<string, unknown> | undefined;
        if (wrapper?.schema && typeof wrapper.schema === 'object' && !Array.isArray(wrapper.schema)) {
            return wrapper.schema as Record<string, unknown>;
        }
    }
    if (format.type === 'json_schema' && format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema)) {
        return format.schema as Record<string, unknown>;
    }
    if (format.schema && typeof format.schema === 'object' && !Array.isArray(format.schema)) {
        return format.schema as Record<string, unknown>;
    }
    return null;
}

function extractSchemaName(format: Record<string, unknown>): string | null {
    if (format.json_schema && typeof format.json_schema === 'object') {
        const wrapper = format.json_schema as Record<string, unknown>;
        if (typeof wrapper.name === 'string') return wrapper.name;
    }
    return null;
}

function buildJsonParseCandidates(content: string): string[] {
    const candidates: string[] = [];
    const trimmed = content.trim();
    if (!trimmed) return candidates;

    candidates.push(trimmed);

    const fullFenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fullFenceMatch?.[1]) {
        candidates.push(fullFenceMatch[1].trim());
    }

    const embeddedFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (embeddedFenceMatch?.[1]) {
        candidates.push(embeddedFenceMatch[1].trim());
    }

    return Array.from(new Set(candidates));
}

function validateAgainstSchema(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
): SchemaValidationIssue | null {
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
        const expected = schemaPrimitiveType(fieldSchema);
        if (!expected) continue;
        const actual = runtimePrimitiveType(data[field]);
        if (actual !== expected && !(expected === 'number' && actual === 'integer')) {
            typeMismatches.push({ field, expected, actual });
        }
    }

    if (missingFields.length === 0 && extraFields.length === 0 && typeMismatches.length === 0) {
        return null;
    }
    return { missingFields, extraFields, typeMismatches };
}

function schemaPrimitiveType(fieldSchema: Record<string, unknown>): string | null {
    const t = fieldSchema.type;
    const resolved = Array.isArray(t) ? t[0] : t;
    return (resolved === 'string' || resolved === 'number' || resolved === 'boolean' || resolved === 'integer')
        ? resolved as string
        : null;
}

function runtimePrimitiveType(value: unknown): string {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    return typeof value;
}

// ─── Follow-up Placeholders ──────────────────────────────────────────────
// TODO: Parse provenance metadata (native_json vs best_effort) in output/metadata
// TODO: Policy default tuning and explicit default matrix
// TODO: Zod support strategy evaluation (no hard dependency): design options, tradeoffs, implementation decision
