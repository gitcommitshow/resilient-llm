import RateLimitManager, { type RateLimitConfig } from './RateLimitManager.js';
import CircuitBreaker, { type CircuitBreakerConfig, type CircuitBreakerStatus } from './CircuitBreaker.js';
import { createHash } from "node:crypto";
import { sleep } from './Utility.js';

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
    static #concurrencyCounts = new Map<string, number>();

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

    getRuntimeMetrics(): RuntimeMetrics | null {
        return this._runtimeMetrics;
    }

    static generateId(): string {
        ResilientOperation.jobCounter++;
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `job_${today}_${ResilientOperation.jobCounter.toString().padStart(3, '0')}`;
    }

    withTokens(llmTokenCount: number = 1): this {
        this._currentTokenCount = llmTokenCount;
        return this;
    }

    withCache(isEnabled: boolean = true, cacheStore?: Record<string, unknown>): this {
        this._enableCache = isEnabled;
        if (cacheStore && typeof cacheStore === 'object') {
            this.cacheStore = cacheStore;
        }
        return this;
    }

    preset(presetName: string): this {
        const presetConfig = this.presets[presetName];
        if (!presetConfig) {
            throw new Error(`Preset '${presetName}' not found`);
        }
        this._currentConfig = { ...this._currentConfig, ...presetConfig };
        return this;
    }

    withConfig(config: Partial<ExecutionConfig>): this {
        this._currentConfig = { ...this._currentConfig, ...config };
        return this;
    }

    withAbortControl(abortController?: AbortController): this {
        this._abortController = abortController || new AbortController();
        return this;
    }

    async execute(asyncFn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): Promise<unknown> {
        this._abortController = this._abortController || new AbortController();

        const finalConfig: ExecutionConfig = {
            llmTokenCount: this._currentTokenCount || (this._currentConfig.llmTokenCount as number) || 1,
            timeout: this._currentConfig.timeout || this.timeout,
            retries: this._currentConfig.retries || this.retries,
            backoffFactor: this._currentConfig.backoffFactor || this.backoffFactor,
            enableCache: this._enableCache || this._currentConfig.enableCache || false
        };

        this._currentTokenCount = null;
        this._enableCache = false;
        this._currentConfig = {};

        try {
            await this._acquireBulkheadSlot();

            const resilientExecutionPromise = finalConfig.enableCache
                ? this._executeWithCache(asyncFn, finalConfig, ...args)
                : this._executeBasic(asyncFn, finalConfig, ...args);

            const result = await this._withTimeout(resilientExecutionPromise, finalConfig.timeout);
            return result;
        } catch (err) {
            throw err;
        } finally {
            this._releaseBulkheadSlot();
        }
    }

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

    private async _executeBasic(asyncFn: (...args: unknown[]) => Promise<unknown>, config: ExecutionConfig, ...args: unknown[]): Promise<unknown> {
        let retryAttempt = 0;
        let delay = 1000;

        while (retryAttempt <= config.retries) {
            try {
                if (this.circuitBreaker.isCircuitOpen()) {
                    const status = this.circuitBreaker.getStatus();
                    console.log(`[ResilientOperation][${this.id}] Circuit breaker is open. Fail count: ${status.failCount}/${status.failureThreshold}. Cooldown remaining: ${status.cooldownRemaining}ms`);
                    throw new Error('Circuit breaker is open');
                }
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

                this.circuitBreaker.recordSuccess();

                const status = this.circuitBreaker.getStatus();
                console.log(`[ResilientOperation][${this.id}] Operation succeeded after ${retryAttempt} retries. Current fail count: ${status.failCount}/${status.failureThreshold}`);

                if (this._collectMetrics && this._runtimeMetrics) {
                    this._runtimeMetrics.circuitBreaker = status;
                }

                return result;
            } catch (err: unknown) {
                const error = err as Error & { response?: { status?: number; headers?: { get(name: string): string | null } } };

                if (this._abortController?.signal?.aborted) {
                    const abortError = new Error(error?.message || this._abortController.signal.reason || 'Operation was aborted');
                    abortError.name = error.name || 'AbortError';
                    throw abortError;
                }

                if (error.name === 'OversizedRequestError') {
                    console.log(`[ResilientOperation][${this.id}] Oversized request error: ${error.message}`);
                    throw error;
                }

                if (error.message === 'Circuit breaker is open') {
                    if (this._collectMetrics && this._runtimeMetrics) {
                        this._runtimeMetrics.circuitBreaker = this.circuitBreaker.getStatus();
                    }
                    throw error;
                }

                this.circuitBreaker.recordFailure();

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

    private async _executeWithCache(asyncFn: (...args: unknown[]) => Promise<unknown>, config: ExecutionConfig, ...args: unknown[]): Promise<unknown> {
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

        if (result && result.statusCode === 200) {
            this._setCachedResponse(cacheKey, result);
        }

        if (this._collectMetrics && this._runtimeMetrics) {
            this._runtimeMetrics.cache = { hit: false, key: cacheKey };
        }

        return result;
    }

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

    private async _acquireBulkheadSlot(): Promise<void> {
        if (!this.maxConcurrent) return;

        const currentCount = ResilientOperation.#concurrencyCounts.get(this.bucketId) || 0;

        if (currentCount >= this.maxConcurrent) {
            throw new Error(`Concurrency limit exceeded for ${this.bucketId}: ${currentCount}/${this.maxConcurrent}`);
        }

        ResilientOperation.#concurrencyCounts.set(this.bucketId, currentCount + 1);
        console.log(`[ResilientOperation][${this.id}] Acquired bulkhead slot for ${this.bucketId}: ${currentCount + 1}/${this.maxConcurrent}`);
    }

    private _releaseBulkheadSlot(): void {
        if (!this.maxConcurrent) return;

        const currentCount = ResilientOperation.#concurrencyCounts.get(this.bucketId) || 0;
        const newCount = Math.max(0, currentCount - 1);
        ResilientOperation.#concurrencyCounts.set(this.bucketId, newCount);
        console.log(`[ResilientOperation][${this.id}] Released bulkhead slot for ${this.bucketId}: ${newCount}/${this.maxConcurrent}`);
    }

    static clearConcurrencyCounts(bucketId: string): void {
        ResilientOperation.#concurrencyCounts.delete(bucketId);
    }
}

export default ResilientOperation;
