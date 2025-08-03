/**
 * A ResilientOperation to execute a function with circuit breaker, token bucket rate limiting, and adaptive retry with backoff and retry-after support.
 * 
 * @param {Object} options - The options for the ResilientOperation.
 * @param {string} options.bucketId - The ID of the bucket.
 * @param {Object} options.rateLimitConfig - The rate limit configuration.
 * @param {number} options.retries - The number of retries.
 * @param {number} options.timeout - The timeout in milliseconds.
 * @param {number} options.backoffFactor - The backoff factor.
 * @param {Function} options.onRateLimitUpdate - The function to call when the rate limit is updated.
 * @param {Object} options.presets - Predefined configuration presets.
 * 
 * @example
 * const operation = new ResilientOperation({
 *   bucketId: 'openai',
 *   rateLimitConfig: { capacity: 10, refillRate: 1 },
 *   retries: 3,
 *   timeout: 5000,
 *   backoffFactor: 2,
 *   onRateLimitUpdate: (rateLimitInfo) => {
 *     console.log('Rate limit updated:', rateLimitInfo);
 *   },
 * });
 * 
 * // Simple usage
 * const result = await operation.withTokens(100).execute(asyncFn, arg1, arg2);
 * 
 * // With preset
 * const result = await operation.preset('fast').withTokens(100).execute(asyncFn, arg1, arg2);
 * 
 * // Complex configuration
 * const result = await operation
 *   .preset('reliable')
 *   .withConfig({ llmTokenCount: 100 })
 *   .withCache()
 *   .execute(asyncFn, apiUrl, requestBody, headers);
 */

import RateLimitManager from './RateLimitManager.js';
import { createHash } from "node:crypto";

class ResilientOperation {
    constructor({
        bucketId,
        rateLimitConfig = { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries = 3,
        timeout = 120000,
        backoffFactor = 2,
        circuitBreakerThreshold = 5,
        circuitBreakerCooldown = 30000,
        onRateLimitUpdate,
        cacheStore = {},
        presets = {
            fast: { timeout: 10000, retries: 1 },
            reliable: { timeout: 300000, retries: 5, backoffFactor: 3 },
            cached: { cacheStore: cacheStore }
        }
    }) {
        this.bucketId = bucketId;
        // rateLimitManager uses requestBucket (for requests) and llmTokenBucket (for LLM text tokens)
        this.rateLimitManager = new RateLimitManager(rateLimitConfig);
        this.retries = retries;
        this.timeout = timeout;
        this.backoffFactor = backoffFactor;
        this.failCount = 0;
        this.circuitOpen = false;
        this.circuitOpenedAt = null;
        this.circuitBreakerThreshold = circuitBreakerThreshold;
        this.circuitBreakerCooldown = circuitBreakerCooldown;
        this.onRateLimitUpdate = onRateLimitUpdate;
        this.nextRetryDelay = null;
        this.cacheStore = cacheStore;
        this.presets = presets;
        
        // Builder state
        this._currentTokenCount = null;
        this._enableCache = false;
        this._currentConfig = {};
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

    /**
     * Execute a function with resilient operation support
     * @param {Function} asyncFn - The function to execute
     * @param {...any} args - Arguments to pass to the asyncFn
     * @returns {Promise<any>} - The result of the function execution
     */
    async execute(asyncFn, ...args) {
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
        
        // Determine which execution method to use
        const resilientExecutionPromise = finalConfig.enableCache
            ? this._executeWithCache(asyncFn, finalConfig, ...args)
            : this._executeBasic(asyncFn, finalConfig, ...args);
        
        // Apply timeout wrapper
        return this._withTimeout(resilientExecutionPromise, finalConfig.timeout);
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
                reject(new Error('Operation timed out'));
            }, timeoutMs);
            
            Promise.resolve(promise)
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    clearTimeout(timerId);
                });
        });
    }

    /**
     * Internal method for basic execution without caching
     * @private
     */
    async _executeBasic(asyncFn, config, ...args) {
        if (this._checkCircuitBreaker()) {
            console.log(`[ResilientOperation] Circuit breaker is open. Fail count: ${this.failCount}/${this.circuitBreakerThreshold}. Cooldown remaining: ${Math.max(0, this.circuitBreakerCooldown - (Date.now() - this.circuitOpenedAt))}ms`);
            throw new Error('Circuit breaker is open');
        }
        
        let attempt = 0;
        let delay = 1000;
        
        while (attempt <= config.retries) {
            try {
                await this.rateLimitManager.acquire(config.llmTokenCount);
                
                const result = await asyncFn(...args);
                
                if (result && result.rateLimitInfo) {
                    this.rateLimitManager.update(result.rateLimitInfo);
                    this.onRateLimitUpdate?.(result.rateLimitInfo);
                }
                this._updateCircuitBreakerState(false);
                
                // Log success with retry information
                if (attempt > 0) {
                    console.log(`[ResilientOperation] Operation succeeded after ${attempt} retries. Current fail count: ${this.failCount}/${this.circuitBreakerThreshold} (${this.circuitBreakerThreshold - this.failCount} failures away from circuit open)`);
                } else {
                    console.log(`[ResilientOperation] Operation succeeded on first attempt. Current fail count: ${this.failCount}/${this.circuitBreakerThreshold} (${this.circuitBreakerThreshold - this.failCount} failures away from circuit open)`);
                }
                
                return result;
            } catch (err) {
                this._updateCircuitBreakerState(true);
                
                // Log retry attempt with circuit breaker status
                const remainingRetries = config.retries - attempt;
                const distanceFromCircuitOpen = this.circuitBreakerThreshold - this.failCount;
                const distanceFromCircuitClose = this.circuitOpen ? 
                    Math.max(0, this.circuitBreakerCooldown - (Date.now() - this.circuitOpenedAt)) : 0;
                
                console.log(`[ResilientOperation] Attempt ${attempt + 1} failed: ${err.message}. Retries remaining: ${remainingRetries}. Fail count: ${this.failCount}/${this.circuitBreakerThreshold} (${distanceFromCircuitOpen} failures away from circuit open${this.circuitOpen ? `, ${distanceFromCircuitClose}ms until circuit can close` : ''})`);
                
                if (!this._shouldRetry(err) || attempt === config.retries) {
                    // Log final failure
                    console.log(`[ResilientOperation] Operation failed after ${attempt + 1} attempts. Final fail count: ${this.failCount}/${this.circuitBreakerThreshold}${this.circuitOpen ? `, circuit is now open for ${this.circuitBreakerCooldown}ms` : ''}`);
                    throw err;
                }
                // If the operation timed out, throw the error
                if (err.message === 'Operation timed out') {
                    throw err;
                }
                const waitTime = this.nextRetryDelay ?? delay;
                this.nextRetryDelay = null;
                await this._sleep(waitTime);
                delay *= config.backoffFactor;
                attempt++;
            }
        }
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

    _checkCircuitBreaker() {
        if (!this.circuitOpen) return false;
        if (Date.now() - this.circuitOpenedAt > this.circuitBreakerCooldown) {
            this.circuitOpen = false;
            this.failCount = 0;
            return false;
        }
        return true;
    }

    _updateCircuitBreakerState(failure) {
        if (failure) {
            this.failCount++;
            if (this.failCount >= this.circuitBreakerThreshold) {
                this.circuitOpen = true;
                this.circuitOpenedAt = Date.now();
            }
        } else {
            this.failCount = 0;
            this.circuitOpen = false;
        }
    }

    _shouldRetry(err) {
        if (err.name === 'AbortError') return false;

        if (err.message === 'Operation timed out') return true;

        if (err.response && err.response.status === 429) {
        const retryAfter = err.response.headers.get('retry-after');
        if (retryAfter) {
            this.nextRetryDelay = this._parseRetryAfterToMs(retryAfter);
        }
        return true;
        }

        if (err.response && err.response.status >= 500) return true;

        return false;
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

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

    _getCachedResponse(cacheKey) {
        return this.cacheStore[cacheKey] || null;
    }

    _setCachedResponse(cacheKey, response) {
        this.cacheStore[cacheKey] = response;
    }

    _clearCache() {
        this.cacheStore = {};
    }
}

export default ResilientOperation;