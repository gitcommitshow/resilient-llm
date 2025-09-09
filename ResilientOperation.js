/**
 * A ResilientOperation to execute a function with circuit breaker, token bucket rate limiting, and adaptive retry with backoff and retry-after support.
 * 
 * @param {Object} options - The options for the ResilientOperation.
 * @param {string} options.bucketId - The ID of the bucket for rate limiting and circuit breaker identification.
 * @param {Object} options.rateLimitConfig - The rate limit configuration for request and token buckets.
 * @param {number} options.retries - The number of retry attempts for a single operation before giving up.
 *                                    Each retry is counted as a separate failure in the circuit breaker.
 *                                    Default: 3
 * @param {number} options.timeout - The timeout in milliseconds for the entire operation (including retries).
 *                                    Default: 120000 (2 minutes)
 * @param {number} options.backoffFactor - The exponential backoff multiplier between retry attempts.
 *                                          Default: 2 (doubles the delay each time)
 * @param {Object} options.circuitBreakerConfig - Circuit breaker configuration for service-level resilience.
 *                                                - failureThreshold: Number of total failed attempts (initial + retries) 
 *                                                  across all operations before opening the circuit.
 *                                                  Default: 5
 *                                                - cooldownPeriod: Time in milliseconds to wait before attempting 
 *                                                  to close the circuit breaker. Default: 30000 (30 seconds)
 * @param {number} options.maxConcurrent - Maximum number of concurrent operations for this bucketId (bulkhead pattern).
 *                                         Default: undefined (no concurrency limit)
 * @param {Function} options.onRateLimitUpdate - Callback function when rate limit information is updated.
 * @param {Object} options.cacheStore - Cache store for storing successful responses.
 * @param {Object} options.presets - Predefined configuration presets for common use cases.
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

import RateLimitManager from './RateLimitManager.js';
import CircuitBreaker from './CircuitBreaker.js';
import { createHash, randomUUID } from "node:crypto";
import { sleep } from './Utility.js';

class ResilientOperation {
    static jobCounter = 0;
    static #concurrencyCounts = new Map(); // bucketId -> current count

    constructor({
        id,
        bucketId,
        rateLimitConfig = { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries = 3,
        timeout = 120000,
        backoffFactor = 2,
        circuitBreakerConfig = { failureThreshold: 5, cooldownPeriod: 30000 },
        maxConcurrent, // New bulkhead option
        onRateLimitUpdate,
        cacheStore = {},
        presets = {
            fast: { timeout: 10000, retries: 1 },
            reliable: { timeout: 300000, retries: 5, backoffFactor: 3 },
            cached: { cacheStore: cacheStore }
        }
    }) {
        this.id = id || ResilientOperation.generateId();
        console.log(`[ResilientOperation][${this.id}] Created ResilientOperation`);
        this.bucketId = bucketId;
        
        // Get shared resources using static getInstance methods
        this.rateLimitManager = RateLimitManager.getInstance(bucketId, rateLimitConfig);
        this.circuitBreaker = CircuitBreaker.getInstance(bucketId, circuitBreakerConfig);
        
        // Instance-specific properties
        this.retries = retries;
        this.timeout = timeout;
        this.backoffFactor = backoffFactor;
        this.maxConcurrent = maxConcurrent; // Store for bulkhead logic
        this.onRateLimitUpdate = onRateLimitUpdate;
        this.cacheStore = cacheStore;
        this.presets = presets;
        
        // Builder state
        this._currentTokenCount = null;
        this._enableCache = false;
        this._currentConfig = {};
        
        // Add AbortController for proper cleanup
        this._abortController = null;
    }

    static generateId() {
        ResilientOperation.jobCounter++;
        const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
        return `job_${today}_${ResilientOperation.jobCounter.toString().padStart(3, '0')}`;
    }

    /**
     * Set the number of LLM tokens for this operation
     * @param {number} llmTokenCount - Number of LLM text tokens this request will use
     * @returns {this} - Returns this instance for method chaining
     */
    withTokens(llmTokenCount = 1) {
        this._currentTokenCount = llmTokenCount;
        return this;
    }

    /**
     * Enable caching for this operation
     * @returns {this} - Returns this instance for method chaining
     */
    withCache() {
        this._enableCache = true;
        return this;
    }

    /**
     * Apply a preset configuration
     * @param {string} presetName - Name of the preset to apply
     * @returns {this} - Returns this instance for method chaining
     */
    preset(presetName) {
        const preset = this.presets[presetName];
        if (!preset) {
            throw new Error(`Preset '${presetName}' not found`);
        }
        this._currentConfig = { ...this._currentConfig, ...preset };
        return this;
    }

    /**
     * Apply custom configuration
     * @param {Object} config - Configuration object to apply
     * @returns {this} - Returns this instance for method chaining
     */
    withConfig(config) {
        this._currentConfig = { ...this._currentConfig, ...config };
        return this;
    }

    withAbortControl(abortController) {
        this._abortController = abortController || new AbortController();
        return this;
    }

    /**
     * Execute a function with resilient operation support
     * @param {Function} asyncFn - The function to execute
     * @param {...any} args - Arguments to pass to the asyncFn
     * @returns {Promise<any>} - The result of the function execution
     */
    async execute(asyncFn, ...args) {
        //TODO: Ensure single execution per instance only, unless the operation failed and we want to execute it again

        // Create a new AbortController for this execution
        this._abortController = this._abortController || new AbortController();
        
        // Merge all configurations
        const finalConfig = {
            llmTokenCount: this._currentTokenCount || this._currentConfig.llmTokenCount || 1,
            timeout: this._currentConfig.timeout || this.timeout,
            retries: this._currentConfig.retries || this.retries,
            backoffFactor: this._currentConfig.backoffFactor || this.backoffFactor,
            enableCache: this._enableCache || this._currentConfig.enableCache
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
        } catch(err){
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
     * @param {Promise} promise - The promise to wrap with timeout
     * @param {number} timeoutMs - Timeout in milliseconds
     * @returns {Promise<any>} - The result of the promise or timeout error
     */
    _withTimeout(promise, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timerId = setTimeout(() => {
                // Abort the ongoing operation when timeout occurs
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
                    // Clean up the abort controller
                    this._abortController = null;
                });
        });
    }

    /**
     * Internal method for basic execution without caching
     * @private
     */
    async _executeBasic(asyncFn, config, ...args) {
        
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
                
                await this.rateLimitManager.acquire(config.llmTokenCount, this._abortController?.signal);
                
                const result = await asyncFn(...args);
                
                if (result && result.rateLimitInfo) {
                    this.rateLimitManager.update(result.rateLimitInfo);
                    this.onRateLimitUpdate?.(result.rateLimitInfo);
                }
                
                // Record success in circuit breaker - this resets the failure count
                this.circuitBreaker.recordSuccess();
                
                // Log success with retry information
                const status = this.circuitBreaker.getStatus();
                console.log(`[ResilientOperation][${this.id}] Operation succeeded after ${retryAttempt} retries. Current fail count: ${status.failCount}/${status.failureThreshold}`);
                
                return result;
            } catch (err) {
                // Check if operation was aborted
                if (this._abortController?.signal?.aborted) {
                    const error = new Error(err?.message || this._abortController.signal.reason || 'Operation was aborted');
                    error.name = err.name || 'AbortError';
                    throw error;
                }

                // If circuit breaker is open, don't record another failure - just exit
                if (err.message === 'Circuit breaker is open') {
                    throw err;
                }

                // UNIFIED APPROACH: Each retry attempt counts as a separate failure in the circuit breaker
                // This provides better service-level resilience by preventing a single operation
                // from consuming all failure slots
                this.circuitBreaker.recordFailure();
                
                // Log retry attempt with circuit breaker status
                const remainingRetries = config.retries - retryAttempt;
                const status = this.circuitBreaker.getStatus();
                
                console.log(`[ResilientOperation][${this.id}] Attempt ${retryAttempt + 1} failed: ${err.message}. Retries remaining: ${remainingRetries}. Circuit breaker fail count: ${status.failCount}/${status.failureThreshold}`);
                if(status?.isOpen) {
                    console.log(`[ResilientOperation][${this.id}] Circuit breaker is open. Cooldown remaining: ${status.cooldownRemaining}ms`);
                }

                if (!this._shouldRetry(err) || retryAttempt >= config.retries) {
                    // Log final failure - this operation has exhausted all retries
                    console.log(`[ResilientOperation][${this.id}] Operation failed after ${retryAttempt + 1} attempts. Circuit breaker fail count: ${status.failCount}/${status.failureThreshold}`);
                    throw err;
                }
                
                // Prepare for the next retry attempt
                const waitTime = this.nextRetryDelay ?? delay;
                console.log(`[ResilientOperation][${this.id}] Waiting for ${waitTime}ms before next retry`);
                this.nextRetryDelay = null;
                await sleep(waitTime, this._abortController.signal);
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
    async _executeWithCache(asyncFn, config, ...args) {
        // For HTTP requests, we expect args to be [apiUrl, requestBody, headers]
        // The abortSignal will be added by _executeBasic
        const [apiUrl, requestBody, headers] = args;
        const cacheKey = this._getCacheKey(apiUrl, requestBody, headers);
        const cachedResponse = this._getCachedResponse(cacheKey);
        
        if (cachedResponse) {
            console.log('Cache hit for request');
            return cachedResponse;
        }

        const result = await this._executeBasic(asyncFn, config, ...args);
        
        // Only cache successful responses (assuming they have a statusCode of 200)
        if (result && result.statusCode === 200) {
            this._setCachedResponse(cacheKey, result);
        }
        
        return result;
    }

    /**
     * Check if the operation should be retried
     * @param {Error} err - The error object
     * @returns {boolean} - True if the operation should be retried, false otherwise
     */
    _shouldRetry(err) {
        if (err.name === 'AbortError') return false;

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

        if (err.response && err.response?.status >= 500) return true;

        return false;
    }

    /**
     * Parse the retry-after header to milliseconds
     * @param {string} retryAfter - The retry-after header value
     * @returns {number} - The number of milliseconds to wait
     */
    _parseRetryAfterToMs(retryAfter) {
        // If it's a number, treat as seconds
        if (!isNaN(retryAfter)) {
            return parseInt(retryAfter, 10) * 1000;
        }
        // Otherwise, try to parse as HTTP date
        const date = Date.parse(retryAfter);
        if (!isNaN(date)) {
            return Math.max(0, date - Date.now());
        }
        // Default fallback: 1 second
        return 1000;
    }

    /**
     * Cache management methods
     */
    _getCacheKey(apiUrl, requestBody, headers) {
        const hash = createHash('sha256');
        hash.update(apiUrl);
        if(requestBody) hash.update(JSON.stringify(requestBody));
        if(headers) hash.update(JSON.stringify(headers));
        return hash.digest('hex');
    }

    /**
     * Get a cached response from the cache store
     * @param {string} cacheKey - The cache key
     * @returns {Object} - The cached response or null if not found
     */
    _getCachedResponse(cacheKey) {
        return this.cacheStore[cacheKey] || null;
    }

    /**
     * Set a cached response in the cache store
     * @param {string} cacheKey - The cache key
     * @param {Object} response - The response to cache
     */
    _setCachedResponse(cacheKey, response) {
        this.cacheStore[cacheKey] = response;
    }

    /**
     * Clear the cache store
     */
    _clearCache() {
        this.cacheStore = {};
    }

    /**
     * Acquire a bulkhead slot for concurrency control
     * @private
     */
    async _acquireBulkheadSlot() {
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
    _releaseBulkheadSlot() {
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
    static clearConcurrencyCounts(bucketId) {
        ResilientOperation.#concurrencyCounts.delete(bucketId);
    }
}

export default ResilientOperation;