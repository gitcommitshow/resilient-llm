import TokenBucket from './TokenBucket.js';
import { sleep } from './Utility.js';

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
     */
    async acquire(llmTokenCount = 1, abortSignal) {
        // Check abort signal before entering loop
        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }
        
        console.log('Awaiting rate limit...');
        while (!abortSignal?.aborted && !(this.requestBucket.tryRemoveToken() && this.llmTokenBucket.tryRemoveToken(llmTokenCount))) {
            await sleep(100, abortSignal);
        }
        console.log('Wait for rate limit complete...');
        
        // Final check after loop - if aborted during sleep, throw error
        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }
    }

    /**
     * Try to remove N LLM tokens from the LLM token bucket (for TPM).
     * Returns true if successful, false otherwise.
     * @param {number} llmTokenCount
     */
    tryRemoveLLMTokens(llmTokenCount) {
        for (let i = 0; i < llmTokenCount; i++) {
            if (!this.llmTokenBucket.tryRemoveToken()) {
                // Rollback if not enough tokens
                for (let j = 0; j < i; j++) {
                    this.llmTokenBucket.tokens++;
                }
                return false;
            }
        }
        return true;
    }

    /**
     * Dynamically update rate limits (e.g., from API response)
     * @param {Object} info
     * @param {number} [info.requestsPerMinute]
     * @param {number} [info.llmTokensPerMinute]
     */
    update(info) {
        if (info.requestsPerMinute) {
            this.requestBucket.update({ capacity: info.requestsPerMinute, refillRate: info.requestsPerMinute / 60 });
        }
        if (info.llmTokensPerMinute) {
            this.llmTokenBucket.update({ capacity: info.llmTokensPerMinute, refillRate: info.llmTokensPerMinute / 60 });
        }
    }  
}

export default RateLimitManager; 