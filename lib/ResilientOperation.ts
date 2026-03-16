import RateLimitManager, { type RateLimitConfig } from './RateLimitManager.js';
import CircuitBreaker, { type CircuitBreakerConfig, type CircuitBreakerStatus } from './CircuitBreaker.js';
import { createHash } from "node:crypto";
import { sleep } from './Utility.js';

/**
 * A ResilientOperation to execute a function with circuit breaker, token bucket rate limiting, and adaptive retry with backoff and retry-after support.
 *
 * @param {Object} options - The options for the ResilientOperation.
 * @param {string} options.bucketId - The ID of the bucket for rate limiting and circuit breaker identification.
 * @param {Object} options.rateLimitConfig - The rate limit configuration for request and token buckets.
 * @param {number} [options.retries=3] - The number of retry attempts for a single operation before giving up.
 *                                       Each retry is counted as a separate failure in the circuit breaker.
 * @param {number} [options.timeout=120000] - The timeout in milliseconds for the entire operation (including retries).
 * @param {number} [options.backoffFactor=2] - The exponential backoff multiplier between retry attempts.
 * @param {Object} options.circuitBreakerConfig - Circuit breaker configuration for service-level resilience.
 *                                                - failureThreshold: Number of total failed attempts (initial + retries)
 *                                                  across all operations before opening the circuit. Default: 5
 *                                                - cooldownPeriod: Time in milliseconds to wait before attempting
 *                                                  to close the circuit breaker. Default: 30000 (30 seconds)
 * @param {number} [options.maxConcurrent] - Maximum number of concurrent operations for this bucketId (bulkhead pattern).
 * @param {Function} [options.onRateLimitUpdate] - Callback function when rate limit information is updated.
 * @param {Object} [options.cacheStore] - Cache store for storing successful responses.
 * @param {Object} [options.presets] - Predefined configuration presets for common use cases.
 *
 * @example
 * // Create a new instance for each operation (recommended)
 * const operation = new ResilientOperation({
 *   bucketId: 'openai',
 *   rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
 *   retries: 3,                    // Each operation gets 3 retry attempts
 *   timeout: 5000,                 // Total timeout for operation + retries
 *   backoffFactor: 2,              // Exponential backoff: 1s, 2s, 4s
 *   maxConcurrent: 10,             // Bulkhead: max 10 concurrent operations
 *   circuitBreakerConfig: {
 *     failureThreshold: 5,         // Circuit opens after 5 total failed attempts
 *     cooldownPeriod: 30000        // Wait 30s before trying to close circuit
 *   },
 *   onRateLimitUpdate: (rateLimitInfo) => {
 *     console.log('Rate limit updated:', rateLimitInfo);
 *   },
 * });
 *
 * // Simple usage - each operation gets fresh instance
 * const result = await operation.withTokens(100).execute(asyncFn, arg1, arg2);
 *
 * // Multiple operations - create new instances for each
 * const operation1 = new ResilientOperation({ bucketId: 'openai', maxConcurrent: 10 });
 * const result1 = await operation1.execute(fn1, args1);
 *
 * const operation2 = new ResilientOperation({ bucketId: 'openai', maxConcurrent: 10 });
 * const result2 = await operation2.execute(fn2, args2);
 *
 * // These share the same circuit breaker and rate limiter but are isolated operations
 */

export interface RetryMetric {
    attempt: number;
    errorName: string;
    errorMessage: string;
    willRetry: boolean;
    nextDelayMs: number | null;
}

export interface RuntimeMetrics {
    retries: RetryMetric[];
    rateLimiting: { requestedTokens: number; totalWaitMs: number };
    circuitBreaker: CircuitBreakerStatus | null;
    cache: { hit: boolean; key: string | null };
}

export interface ResilientOperationPresets {
    [key: string]: Partial<ResilientOperationConfig & { enableCache: boolean }>;
}

export interface ResilientOperationConfig {
    id?: string;
    bucketId: string;
    rateLimitConfig?: RateLimitConfig;
    retries?: number;
    timeout?: number;
    backoffFactor?: number;
    circuitBreakerConfig?: CircuitBreakerConfig;
    maxConcurrent?: number;
    collectMetrics?: boolean;
    onRateLimitUpdate?: (rateLimitInfo: RateLimitConfig) => void;
    cacheStore?: Record<string, unknown>;
    presets?: ResilientOperationPresets;
}

interface ExecutionConfig {
    llmTokenCount: number;
    timeout: number;
    retries: number;
    backoffFactor: number;
    enableCache: boolean;
}

interface ExecutionResult {
    data?: unknown;
    statusCode?: number;
    rateLimitInfo?: RateLimitConfig;
    [key: string]: unknown;
}

class ResilientOperation {
    static jobCounter = 0;
    static #concurrencyCounts = new Map<string, number>(); // bucketId -> current count

    id: string;
    bucketId: string;
    rateLimitManager: RateLimitManager;
    circuitBreaker: CircuitBreaker;
    retries: number;
    timeout: number;
    backoffFactor: number;
    maxConcurrent: number | undefined;
    onRateLimitUpdate: ((rateLimitInfo: RateLimitConfig) => void) | undefined;
    cacheStore: Record<string, unknown>;
    presets: ResilientOperationPresets;
    nextRetryDelay: number | null | undefined;

    private _collectMetrics: boolean;
    private _runtimeMetrics: RuntimeMetrics | null;
    private _currentTokenCount: number | null;
    private _enableCache: boolean;
    private _currentConfig: Partial<ExecutionConfig>;
    private _abortController: AbortController | null;

    /** Create a ResilientOperation. Shared rate limiter and circuit breaker are keyed by bucketId. */
    constructor({
        id,
        bucketId,
        rateLimitConfig = { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries = 3,
        timeout = 120000,
        backoffFactor = 2,
        circuitBreakerConfig = { failureThreshold: 5, cooldownPeriod: 30000 },
        maxConcurrent,
        collectMetrics = false,
        onRateLimitUpdate,
        cacheStore = {},
        presets
    }: ResilientOperationConfig) {
        this.id = id || ResilientOperation.generateId();
        console.log(`[ResilientOperation][${this.id}] Created ResilientOperation`);
        this.bucketId = bucketId;

        // Get shared resources using static getInstance methods
        this.rateLimitManager = RateLimitManager.getInstance(bucketId, rateLimitConfig);
        this.circuitBreaker = CircuitBreaker.getInstance(bucketId, circuitBreakerConfig);

        this.retries = retries;
        this.timeout = timeout;
        this.backoffFactor = backoffFactor;
        this.maxConcurrent = maxConcurrent;
        this.onRateLimitUpdate = onRateLimitUpdate;
        this.cacheStore = cacheStore;
        this.presets = presets || {
            fast: { timeout: 10000, retries: 1 },
            reliable: { timeout: 300000, retries: 5, backoffFactor: 3 },
            cached: { enableCache: true }
        };

        this._collectMetrics = collectMetrics;
        this._runtimeMetrics = collectMetrics ? {
            retries: [],
            rateLimiting: { requestedTokens: 0, totalWaitMs: 0 },
            circuitBreaker: null,
            cache: { hit: false, key: null },
        } : null;

        this._currentTokenCount = null;
        this._enableCache = false;
        this._currentConfig = {};

        this._abortController = null;
    }

    /** Get collected runtime metrics (null when collectMetrics is disabled). */
    getRuntimeMetrics(): RuntimeMetrics | null {
        return this._runtimeMetrics;
    }

    /** Generate a unique job id (job_YYYYMMDD_NNN). */
    static generateId(): string {
        ResilientOperation.jobCounter++;
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `job_${today}_${ResilientOperation.jobCounter.toString().padStart(3, '0')}`;
    }

    /** Set the number of tokens for this operation (for rate limiting). Returns this for chaining. */
    withTokens(llmTokenCount: number = 1): this {
        this._currentTokenCount = llmTokenCount;
        return this;
    }

    /** Enable caching for this operation. Optionally pass cacheStore. Returns this for chaining. */
    withCache(isEnabled: boolean = true, cacheStore?: Record<string, unknown>): this {
        this._enableCache = isEnabled;
        if (cacheStore && typeof cacheStore === 'object') {
            this.cacheStore = cacheStore;
        }
        return this;
    }

    /** Apply a preset configuration (e.g. 'fast', 'reliable', 'cached'). Returns this for chaining. */
    preset(presetName: string): this {
        const presetConfig = this.presets[presetName];
        if (!presetConfig) {
            throw new Error(`Preset '${presetName}' not found`);
        }
        this._currentConfig = { ...this._currentConfig, ...presetConfig };
        return this;
    }

    /** Apply custom execution config (timeout, retries, backoffFactor, enableCache, etc.). Returns this for chaining. */
    withConfig(config: Partial<ExecutionConfig>): this {
        this._currentConfig = { ...this._currentConfig, ...config };
        return this;
    }

    /** Attach an AbortController for cancellation. Returns this for chaining. */
    withAbortControl(abortController?: AbortController): this {
        this._abortController = abortController || new AbortController();
        return this;
    }

    /**
     * Execute the async function with resilience (rate limit, circuit breaker, retries, timeout, optional cache).
     * @param asyncFn - The function to execute
     * @param args - Arguments to pass to asyncFn
     * @returns The result of the function execution
     */
    async execute(asyncFn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): Promise<unknown> {
        //TODO: Ensure single execution per instance only, unless the operation failed and we want to execute it again

        // Create a new AbortController for this execution
        this._abortController = this._abortController || new AbortController();

        // Merge all configurations
        const finalConfig: ExecutionConfig = {
            llmTokenCount: this._currentTokenCount || (this._currentConfig.llmTokenCount as number) || 1,
            timeout: this._currentConfig.timeout || this.timeout,
            retries: this._currentConfig.retries || this.retries,
            backoffFactor: this._currentConfig.backoffFactor || this.backoffFactor,
            enableCache: this._enableCache || this._currentConfig.enableCache || false
        };

        // Reset builder state
        this._currentTokenCount = null;
        this._enableCache = false;
        this._currentConfig = {};

        try {
            // Acquire bulkhead slot if maxConcurrent is set
            await this._acquireBulkheadSlot();

            // Determine which execution method to use
            const resilientExecutionPromise = finalConfig.enableCache
                ? this._executeWithCache(asyncFn, finalConfig, ...args)
                : this._executeBasic(asyncFn, finalConfig, ...args);

            // Apply timeout wrapper
            const result = await this._withTimeout(resilientExecutionPromise, finalConfig.timeout);
            return result;
        } catch (err) {
            throw err;
        } finally {
            // Always release bulkhead slot
            this._releaseBulkheadSlot();
            //TODO: cleanup the abort controller
        }
    }

    /**
     * Internal method to wrap a promise with timeout functionality
     * @private
     * @param promise - The promise to wrap with timeout
     * @param timeoutMs - The timeout in milliseconds
     * @returns The result of the promise
     */
    private _withTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const timerId = setTimeout(() => {
                if (this._abortController) {
                    this._abortController.abort();
                }

                const error = new Error('Operation timed out');
                error.name = 'TimeoutError';
                reject(error);
            }, timeoutMs);

            Promise.resolve(promise)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    clearTimeout(timerId);
                    this._abortController = null;
                });
        });
    }

    /**
     * Internal method for basic execution without caching
     * @private
     */
    private async _executeBasic(asyncFn: (...args: unknown[]) => Promise<unknown>, config: ExecutionConfig, ...args: unknown[]): Promise<unknown> {
        let retryAttempt = 0;
        let delay = 1000;

        while (retryAttempt <= config.retries) {
            try {
                // Check circuit breaker first
                if (this.circuitBreaker.isCircuitOpen()) {
                    const status = this.circuitBreaker.getStatus();
                    console.log(`[ResilientOperation][${this.id}] Circuit breaker is open. Fail count: ${status.failCount}/${status.failureThreshold}. Cooldown remaining: ${status.cooldownRemaining}ms`);
                    throw new Error('Circuit breaker is open');
                }
                // Check if operation was aborted
                if (this._abortController?.signal?.aborted) {
                    const error = new Error(this._abortController.signal.reason || 'Operation was aborted');
                    error.name = 'AbortError';
                    throw error;
                }

                const rateLimitResult = await this.rateLimitManager.acquire(config.llmTokenCount, this._abortController?.signal);
                if (this._collectMetrics && this._runtimeMetrics && rateLimitResult) {
                    this._runtimeMetrics.rateLimiting.requestedTokens = config.llmTokenCount;
                    this._runtimeMetrics.rateLimiting.totalWaitMs += rateLimitResult.totalWaitMs || 0;
                }

                const result = await asyncFn(...args) as ExecutionResult | undefined;

                if (result && result.rateLimitInfo) {
                    this.rateLimitManager.syncConfig(result.rateLimitInfo);
                    this.onRateLimitUpdate?.(result.rateLimitInfo);
                }

                // Record success in circuit breaker - this resets the failure count
                this.circuitBreaker.recordSuccess();

                // Log success with retry information
                const status = this.circuitBreaker.getStatus();
                console.log(`[ResilientOperation][${this.id}] Operation succeeded after ${retryAttempt} retries. Current fail count: ${status.failCount}/${status.failureThreshold}`);

                if (this._collectMetrics && this._runtimeMetrics) {
                    this._runtimeMetrics.circuitBreaker = status;
                }

                return result;
            } catch (err: unknown) {
                const error = err as Error & { response?: { status?: number; headers?: { get(name: string): string | null } } };

                // Check if operation was aborted
                if (this._abortController?.signal?.aborted) {
                    const abortError = new Error(error?.message || this._abortController.signal.reason || 'Operation was aborted');
                    abortError.name = error.name || 'AbortError';
                    throw abortError;
                }

                if (error.name === 'OversizedRequestError') {
                    console.log(`[ResilientOperation][${this.id}] Oversized request error: ${error.message}`);
                    throw error;
                }

                // If circuit breaker is open, don't record another failure - just exit
                if (error.message === 'Circuit breaker is open') {
                    if (this._collectMetrics && this._runtimeMetrics) {
                        this._runtimeMetrics.circuitBreaker = this.circuitBreaker.getStatus();
                    }
                    throw error;
                }

                // UNIFIED APPROACH: Each retry attempt counts as a separate failure in the circuit breaker
                // This provides better service-level resilience by preventing a single operation
                // from consuming all failure slots
                this.circuitBreaker.recordFailure();

                // Log retry attempt with circuit breaker status
                const remainingRetries = config.retries - retryAttempt;
                const status = this.circuitBreaker.getStatus();

                console.log(`[ResilientOperation][${this.id}] Attempt ${retryAttempt + 1} failed: ${error.message}. Retries remaining: ${remainingRetries}. Circuit breaker fail count: ${status.failCount}/${status.failureThreshold}`);
                if (status?.isOpen) {
                    console.log(`[ResilientOperation][${this.id}] Circuit breaker is open. Cooldown remaining: ${status.cooldownRemaining}ms`);
                }

                const willRetry = this._shouldRetry(error) && retryAttempt < config.retries;
                const nextDelayMs = willRetry ? (this.nextRetryDelay ?? delay) : null;

                if (this._collectMetrics && this._runtimeMetrics) {
                    this._runtimeMetrics.retries.push({
                        attempt: retryAttempt + 1,
                        errorName: error.name,
                        errorMessage: error.message,
                        willRetry,
                        nextDelayMs,
                    });
                    this._runtimeMetrics.circuitBreaker = status;
                }

                if (!willRetry) {
                    console.log(`[ResilientOperation][${this.id}] Operation failed after ${retryAttempt + 1} attempts. Circuit breaker fail count: ${status.failCount}/${status.failureThreshold}`);
                    throw error;
                }

                // Prepare for the next retry attempt
                const waitTime = this.nextRetryDelay ?? delay;
                console.log(`[ResilientOperation][${this.id}] Waiting for ${waitTime}ms before next retry`);
                this.nextRetryDelay = null;
                await sleep(waitTime, this._abortController!.signal);
                delay *= config.backoffFactor;
                retryAttempt++;
            }
        }
        console.log(`[ResilientOperation][${this.id}] Exiting execution attempt loop`);
    }

    /**
     * Internal method for execution with caching
     * @private
     */
    private async _executeWithCache(asyncFn: (...args: unknown[]) => Promise<unknown>, config: ExecutionConfig, ...args: unknown[]): Promise<unknown> {
        // For HTTP requests, we expect args to be [apiUrl, requestBody, headers]
        // The abortSignal will be added by _executeBasic
        const [apiUrl, requestBody, headers] = args as [string, unknown, unknown];
        const cacheKey = this._getCacheKey(apiUrl, requestBody, headers);
        const cachedResponse = this._getCachedResponse(cacheKey);

        if (cachedResponse) {
            console.log('Cache hit for request');
            if (this._collectMetrics && this._runtimeMetrics) {
                this._runtimeMetrics.cache = { hit: true, key: cacheKey };
            }
            return cachedResponse;
        }

        const result = await this._executeBasic(asyncFn, config, ...args) as ExecutionResult | undefined;

        // Cache only successful responses (assuming they have a statusCode of 200)
        if (result && result.statusCode === 200) {
            this._setCachedResponse(cacheKey, result);
        }

        if (this._collectMetrics && this._runtimeMetrics) {
            this._runtimeMetrics.cache = { hit: false, key: cacheKey };
        }

        return result;
    }

    /**
     * Check if the operation should be retried
     * @private
     * @param {Error} err - The error object
     * @returns {boolean} - True if the operation should be retried, false otherwise
     */
    private _shouldRetry(err: Error & { response?: { status?: number; headers?: { get(name: string): string | null } } }): boolean {
        if (err.name === 'AbortError') return false;

        if (err.name === 'OversizedRequestError') return false;

        if (err.name === 'TimeoutError') return true;

        if (err.message === 'Operation timed out') return true;

        if (err.message === 'Circuit breaker is open') return false;

        if (err.response && err.response?.status === 429) {
            const retryAfter = err.response?.headers?.get('retry-after');
            if (retryAfter) {
                this.nextRetryDelay = this._parseRetryAfterToMs(retryAfter);
            }
            return true;
        }

        if (err.response && err.response?.status !== undefined && err.response.status >= 500) return true;

        return false;
    }

    /**
     * Parse the retry-after header to milliseconds
     * @private
     * @param {string} retryAfter - The retry-after header value
     * @returns {number} - The number of milliseconds to wait
     */
    private _parseRetryAfterToMs(retryAfter: string): number {
        if (!isNaN(Number(retryAfter))) {
            return parseInt(retryAfter, 10) * 1000;
        }
        const date = Date.parse(retryAfter);
        if (!isNaN(date)) {
            return Math.max(0, date - Date.now());
        }
        return 1000;
    }

    /**
     * Cache management methods
     */
    private _getCacheKey(apiUrl: string, requestBody: unknown, headers: unknown): string {
        const hash = createHash('sha256');
        hash.update(apiUrl);
        if (requestBody) hash.update(JSON.stringify(requestBody));
        if (headers) hash.update(JSON.stringify(headers));
        return hash.digest('hex');
    }

    private _getCachedResponse(cacheKey: string): unknown {
        return this.cacheStore[cacheKey] || null;
    }

    private _setCachedResponse(cacheKey: string, response: unknown): void {
        this.cacheStore[cacheKey] = response;
    }

    /**
     * Acquire a bulkhead slot for concurrency control
     * @private
     */
    private async _acquireBulkheadSlot(): Promise<void> {
        if (!this.maxConcurrent) return;

        const currentCount = ResilientOperation.#concurrencyCounts.get(this.bucketId) || 0;

        if (currentCount >= this.maxConcurrent) {
            throw new Error(`Concurrency limit exceeded for ${this.bucketId}: ${currentCount}/${this.maxConcurrent}`);
        }

        ResilientOperation.#concurrencyCounts.set(this.bucketId, currentCount + 1);
        console.log(`[ResilientOperation][${this.id}] Acquired bulkhead slot for ${this.bucketId}: ${currentCount + 1}/${this.maxConcurrent}`);
    }

    /**
     * Release a bulkhead slot for concurrency control
     * @private
     */
    private _releaseBulkheadSlot(): void {
        if (!this.maxConcurrent) return;

        const currentCount = ResilientOperation.#concurrencyCounts.get(this.bucketId) || 0;
        const newCount = Math.max(0, currentCount - 1);
        ResilientOperation.#concurrencyCounts.set(this.bucketId, newCount);
        console.log(`[ResilientOperation][${this.id}] Released bulkhead slot for ${this.bucketId}: ${newCount}/${this.maxConcurrent}`);
    }

    /**
     * Clear concurrency counts for a bucketId (useful for testing)
     * @param {string} bucketId - The service identifier
     */
    static clearConcurrencyCounts(bucketId: string): void {
        ResilientOperation.#concurrencyCounts.delete(bucketId);
    }
}

export default ResilientOperation;
