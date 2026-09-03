/**
 * Generic resilience config schema, normalizer, and timer safety net.
 *
 * Every numeric resilience knob has one row in RESILIENCE_SCHEMA defining its
 * type, default, and illegal bounds. normalizeResilienceConfig() walks an input
 * object against the schema, clamping illegal values to their defaults (or the
 * platform max for timer fields) and emitting config_clamped / config_unwise
 * events the caller can push into metadata.events.
 *
 * safeDelay() is the last-line guard for setTimeout/sleep: values that overflow
 * the 32-bit signed integer timer limit are clamped, preventing the silent
 * collapse to 1ms that caused the original timeout bug.
 */

/** 32-bit signed integer max - the platform ceiling for setTimeout/setInterval. */
export const MAX_TIMER_MS = 2_147_483_647;

export interface FieldSchema {
    /** Minimum legal value (inclusive). */
    min: number;
    /** Maximum legal value (inclusive). null means no upper bound except platform limits. */
    max: number | null;
    /** Default value when the input is missing or illegal. undefined means the field is optional. */
    default: number | undefined;
    /** If true, non-integer values are illegal. */
    integer?: boolean;
    /** If true, the field may be omitted entirely (undefined is legal, not clamped). */
    optional?: boolean;
    /** If true, this value is used as a timer delay and is capped at MAX_TIMER_MS. */
    timerField?: boolean;
}

/** Schema for all resilience knobs. Sampling params (temperature, topP, maxTokens) are excluded. */
export const RESILIENCE_SCHEMA: Record<string, FieldSchema> = {
    timeout:            { min: 1,  max: MAX_TIMER_MS, default: 60_000,  integer: true, timerField: true },
    retries:            { min: 0,  max: null,         default: 3,       integer: true },
    backoffFactor:      { min: 1,  max: null,         default: 2 },
    failureThreshold:   { min: 1,  max: null,         default: 5,       integer: true },
    cooldownPeriod:     { min: 1,  max: MAX_TIMER_MS, default: 30_000,  integer: true, timerField: true },
    requestsPerMinute:  { min: 1,  max: null,         default: 10,      integer: true },
    llmTokensPerMinute: { min: 1,  max: null,         default: 150_000, integer: true },
    maxConcurrent:      { min: 1,  max: null,         default: undefined, integer: true, optional: true },
};

/** A config event recording a clamped or unwise value for metadata.events. */
export interface ConfigEvent {
    type: 'config_clamped' | 'config_unwise';
    field: string;
    requested: unknown;
    effective: number | undefined;
    reason: string;
}

/** Result of normalizing a flat key-value bag of resilience config. */
export interface NormalizeResult {
    values: Record<string, number | undefined>;
    events: ConfigEvent[];
}

/**
 * Normalize a flat bag of resilience config values against the schema.
 * Illegal values are replaced with defaults and a config_clamped event is emitted.
 * Legal-but-extreme values emit config_unwise events.
 */
export function normalizeResilienceConfig(
    input: Record<string, unknown>,
    schema: Record<string, FieldSchema> = RESILIENCE_SCHEMA
): NormalizeResult {
    const values: Record<string, number | undefined> = {};
    const events: ConfigEvent[] = [];

    for (const [field, fieldSchema] of Object.entries(schema)) {
        const raw = input[field];

        // Optional field not provided - leave as undefined
        if (raw === undefined || raw === null) {
            if (fieldSchema.optional) {
                values[field] = undefined;
                continue;
            }
            // Required field missing - use default silently (not a clamp, just a default)
            values[field] = fieldSchema.default;
            continue;
        }

        const n = Number(raw);

        // Non-finite (NaN, Infinity, -Infinity) or wrong type
        if (!Number.isFinite(n)) {
            events.push({
                type: 'config_clamped',
                field,
                requested: raw,
                effective: fieldSchema.default,
                reason: `${field} is not a finite number (got ${String(raw)}), using default ${fieldSchema.default}`,
            });
            values[field] = fieldSchema.default;
            continue;
        }

        // Integer check
        if (fieldSchema.integer && !Number.isInteger(n)) {
            const rounded = Math.round(n);
            const clamped = _clampToRange(rounded, fieldSchema);
            events.push({
                type: 'config_clamped',
                field,
                requested: raw,
                effective: clamped,
                reason: `${field} must be an integer (got ${n}), rounded to ${clamped}`,
            });
            values[field] = clamped;
            continue;
        }

        // Below minimum
        if (n < fieldSchema.min) {
            events.push({
                type: 'config_clamped',
                field,
                requested: raw,
                effective: fieldSchema.default,
                reason: `${field} is below minimum ${fieldSchema.min} (got ${n}), using default ${fieldSchema.default}`,
            });
            values[field] = fieldSchema.default;
            continue;
        }

        // Above maximum (platform-unsafe for timer fields)
        if (fieldSchema.max !== null && n > fieldSchema.max) {
            events.push({
                type: 'config_clamped',
                field,
                requested: raw,
                effective: fieldSchema.max,
                reason: `${field} exceeds maximum ${fieldSchema.max} (got ${n}), clamped to ${fieldSchema.max}`,
            });
            values[field] = fieldSchema.max;
            continue;
        }

        // Value is legal
        values[field] = n;
    }

    // Heuristic warnings for legal-but-extreme combinations
    _checkUnwiseCombinations(values, events);

    return { values, events };
}

/**
 * Clamp a value to the legal range defined by a field schema.
 * Used after rounding non-integers.
 */
function _clampToRange(n: number, schema: FieldSchema): number {
    if (n < schema.min) return schema.default ?? schema.min;
    if (schema.max !== null && n > schema.max) return schema.max;
    return n;
}

/**
 * Emit config_unwise events for legal values that look dangerous in combination.
 */
function _checkUnwiseCombinations(values: Record<string, number | undefined>, events: ConfigEvent[]): void {
    const timeout = values.timeout;
    const retries = values.retries;
    const backoffFactor = values.backoffFactor;

    // Timeout too short for the retry/backoff strategy
    if (timeout != null && retries != null && backoffFactor != null && retries > 0) {
        // Estimate minimum time needed: sum of backoff delays (1s * factor^0 + 1s * factor^1 + ...)
        let estimatedMinMs = 0;
        let delay = 1000;
        for (let i = 0; i < retries; i++) {
            estimatedMinMs += delay;
            delay *= backoffFactor;
        }
        if (timeout < estimatedMinMs) {
            events.push({
                type: 'config_unwise',
                field: 'timeout',
                requested: timeout,
                effective: timeout,
                reason: `timeout (${timeout}ms) is shorter than the estimated backoff time for ${retries} retries (~${Math.round(estimatedMinMs)}ms). Retries may be cut short.`,
            });
        }
    }

    // Very high retry count
    if (retries != null && retries > 50) {
        events.push({
            type: 'config_unwise',
            field: 'retries',
            requested: retries,
            effective: retries,
            reason: `retries is set to ${retries}, which is unusually high and may cause long recovery times.`,
        });
    }
}

/**
 * Last-line safety net for any timer delay (setTimeout, sleep).
 * Clamps non-finite and overflowing values to prevent the silent 1ms collapse.
 * This guards against values from _parseRetryAfterToMs and computed backoff,
 * not just user config.
 *
 * @param ms - The delay in milliseconds
 * @param label - A descriptive label for logging (e.g. "timeout", "backoff delay")
 * @returns The safe delay value, clamped to [1, MAX_TIMER_MS]
 */
export function safeDelay(ms: number, label?: string): number {
    if (!Number.isFinite(ms) || ms < 1) {
        console.warn(`[ConfigSchema] ${label ?? 'delay'} is not a valid positive number (got ${ms}), using 1ms`);
        return 1;
    }
    if (ms > MAX_TIMER_MS) {
        console.warn(`[ConfigSchema] ${label ?? 'delay'} exceeds platform timer maximum (got ${ms}), clamped to ${MAX_TIMER_MS}ms`);
        return MAX_TIMER_MS;
    }
    return ms;
}
