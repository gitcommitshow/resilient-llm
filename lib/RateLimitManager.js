import TokenBucket from './TokenBucket.js';
import { sleep } from './Utility.js';

/**
 * @summary
 * Rate Limit Manager implementation
 * @description
 * The rate limit manager is a class that manages the rate limits for a given bucketId.
 * It uses two token buckets to limit the number of requests and the number of LLM tokens per minute.
 * @param {Object} config - Rate limit configuration
 * @param {number} config.requestsPerMinute - Max requests per minute
 * @param {number} config.llmTokensPerMinute - Max LLM text tokens per minute
 * @example
 * const rateLimitManager = new RateLimitManager({ requestsPerMinute: 60, llmTokensPerMinute: 150000 });
 * rateLimitManager.acquire(4048); // true - 1 request token and 4048 LLM token removed from the buckets
 * rateLimitManager.syncConfig({ requestsPerMinute: 120, llmTokensPerMinute: 300000 }); // update the rate limit configuration
 * */
class RateLimitManager {
    static #instances = new Map(); // bucketId -> instance
    
    /**
     * @param {Object} config
     * @param {number} config.requestsPerMinute - Max requests per minute
     * @param {number} config.llmTokensPerMinute - Max LLM text tokens per minute
     */
    constructor({ requestsPerMinute = 60, llmTokensPerMinute = 150000 } = {}) {
        // requestBucket: limits number of requests per minute (rate limiter tokens)
        this.requestBucket = new TokenBucket(requestsPerMinute, requestsPerMinute / 60); // refill per second
        // llmTokenBucket: limits number of LLM text tokens per minute
        this.llmTokenBucket = new TokenBucket(llmTokensPerMinute, llmTokensPerMinute / 60); // refill per second
    }
    
    /**
     * Get or create a rate limit manager instance for the given bucketId
     * @param {string} bucketId - The service identifier
     * @param {Object} config - Rate limit configuration
     * @returns {RateLimitManager} - The rate limit manager instance
     */
    static getInstance(bucketId, config) {
        if (!this.#instances.has(bucketId)) {
            this.#instances.set(bucketId, new RateLimitManager(config));
        } else if (config) {
            this.#instances.get(bucketId).syncConfig(config);
        }
        return this.#instances.get(bucketId);
    }
    
    /**
     * Clear a rate limit manager instance for the given bucketId
     * @param {string} bucketId - The service identifier
     */
    static clear(bucketId) {
        this.#instances.delete(bucketId);
    }

    /**
     * Attempt to acquire a request slot and the required number of LLM tokens.
     * Waits until both are available.
     * @param {number} llmTokenCount
     * @param {AbortSignal} [abortSignal]
     * @returns {Promise<{totalWaitMs: number}>} Time spent waiting for rate limit tokens
     */
    async acquire(llmTokenCount = 1, abortSignal) {
        // Check abort signal before entering loop
        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }
        
        console.log('Awaiting rate limit...');
        let waitTime = 0;
        while (!abortSignal?.aborted) {
            let llmTokenAcquired, requestAcquired;
            try {
                llmTokenAcquired = false;
                requestAcquired = false;
                llmTokenAcquired = this.llmTokenBucket.tryRemoveToken(llmTokenCount);
                if(llmTokenAcquired) {
                    requestAcquired = this.requestBucket.tryRemoveToken();
                }
                if (llmTokenAcquired && requestAcquired) {
                    console.log('Rate limit acquired after waiting for %dms...', waitTime);
                    break;
                }
                console.debug('Waiting for rate limit... %dms', waitTime);
                waitTime += 100;
                if(llmTokenAcquired) this.llmTokenBucket.refundTokens(llmTokenCount);
                if(requestAcquired) this.requestBucket.refundTokens();
                await sleep(100, abortSignal);
            } catch (error) {
                if(llmTokenAcquired) this.llmTokenBucket.refundTokens(llmTokenCount);
                if(requestAcquired) this.requestBucket.refundTokens();
                throw error;
            }
        }
        console.log('Wait for rate limit complete...');
        
        // Final check after loop - if aborted during sleep, throw error
        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }

        return { totalWaitMs: waitTime };
    }

    /**
     * Dynamically update rate limits (e.g., from API response)
     * @param {Object} config
     * @param {number} [config.requestsPerMinute]
     * @param {number} [config.llmTokensPerMinute]
     */
    syncConfig(config) {
        if (config?.requestsPerMinute) {
            this.requestBucket.syncConfig({ capacity: config.requestsPerMinute, refillRate: config.requestsPerMinute / 60 });
        }
        if (config?.llmTokensPerMinute) {
            this.llmTokenBucket.syncConfig({ capacity: config.llmTokensPerMinute, refillRate: config.llmTokensPerMinute / 60 });
        }
    }  
}

export default RateLimitManager; 