import TokenBucket from './TokenBucket.js';

class RateLimitManager {
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
     * Attempt to acquire a request slot and the required number of LLM tokens.
     * Waits until both are available.
     * @param {number} llmTokenCount
     */
    async acquire(llmTokenCount = 1) {
        while (!(this.requestBucket.tryRemoveToken() && this.llmTokenBucket.tryRemoveToken(llmTokenCount))) {
            await this._sleep(100);
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

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default RateLimitManager; 