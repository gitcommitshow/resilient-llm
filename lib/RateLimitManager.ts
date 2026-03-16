import TokenBucket from './TokenBucket.js';
import { sleep } from './Utility.js';

export interface RateLimitConfig {
    requestsPerMinute?: number;
    llmTokensPerMinute?: number;
}

export interface AcquireResult {
    totalWaitMs: number;
}

/**
 * Rate Limit Manager: manages rate limits for a given bucketId using two token buckets
 * (requests per minute and LLM tokens per minute).
 *
 * @param config - Rate limit configuration
 * @param config.requestsPerMinute - Max requests per minute
 * @param config.llmTokensPerMinute - Max LLM text tokens per minute
 * @example
 * const rateLimitManager = new RateLimitManager({ requestsPerMinute: 60, llmTokensPerMinute: 150000 });
 * rateLimitManager.acquire(4048); // 1 request token + 4048 LLM tokens
 * rateLimitManager.syncConfig({ requestsPerMinute: 120, llmTokensPerMinute: 300000 });
 */
class RateLimitManager {
    static #instances = new Map<string, RateLimitManager>(); // bucketId -> instance

    /** Limits number of requests per minute (rate limiter tokens). */
    requestBucket: TokenBucket;
    /** Limits number of LLM text tokens per minute. */
    llmTokenBucket: TokenBucket;

    constructor({ requestsPerMinute = 60, llmTokensPerMinute = 150000 }: RateLimitConfig = {}) {
        this.requestBucket = new TokenBucket(requestsPerMinute, requestsPerMinute / 60); // refill per second
        this.llmTokenBucket = new TokenBucket(llmTokensPerMinute, llmTokensPerMinute / 60); // refill per second
    }

    /**
     * Get or create a rate limit manager instance for the given bucketId.
     * @param bucketId - The service identifier
     * @param config - Rate limit configuration (merged if instance exists)
     * @returns The rate limit manager instance for that bucket
     */
    static getInstance(bucketId: string, config?: RateLimitConfig): RateLimitManager {
        if (!this.#instances.has(bucketId)) {
            this.#instances.set(bucketId, new RateLimitManager(config));
        } else if (config) {
            this.#instances.get(bucketId)!.syncConfig(config);
        }
        return this.#instances.get(bucketId)!;
    }

    /**
     * Clear a rate limit manager instance for the given bucketId.
     * @param bucketId - The service identifier
     */
    static clear(bucketId: string): void {
        this.#instances.delete(bucketId);
    }

    /**
     * Attempt to acquire a request slot and the required number of LLM tokens.
     * Waits until both are available; respects abortSignal for cancellation.
     * @param llmTokenCount - Number of LLM tokens to reserve
     * @param abortSignal - Optional abort signal to cancel the wait
     * @returns Time spent waiting for rate limit tokens (totalWaitMs)
     */
    async acquire(llmTokenCount: number = 1, abortSignal?: AbortSignal): Promise<AcquireResult> {
        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }

        console.log('Awaiting rate limit...');
        let waitTime = 0;
        while (!abortSignal?.aborted) {
            let llmTokenAcquired = false;
            let requestAcquired = false;
            try {
                llmTokenAcquired = this.llmTokenBucket.tryRemoveToken(llmTokenCount);
                if (llmTokenAcquired) {
                    requestAcquired = this.requestBucket.tryRemoveToken();
                }
                if (llmTokenAcquired && requestAcquired) {
                    console.log('Rate limit acquired after waiting for %dms...', waitTime);
                    break;
                }
                console.debug('Waiting for rate limit... %dms', waitTime);
                waitTime += 100;
                if (llmTokenAcquired) this.llmTokenBucket.refundTokens(llmTokenCount);
                if (requestAcquired) this.requestBucket.refundTokens();
                await sleep(100, abortSignal);
            } catch (error) {
                if (llmTokenAcquired) this.llmTokenBucket.refundTokens(llmTokenCount);
                if (requestAcquired) this.requestBucket.refundTokens();
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
     * Dynamically update rate limits (e.g., from API response headers).
     * @param config - Partial rate limit config (requestsPerMinute, llmTokensPerMinute)
     */
    syncConfig(config?: RateLimitConfig): void {
        if (config?.requestsPerMinute) {
            this.requestBucket.syncConfig({ capacity: config.requestsPerMinute, refillRate: config.requestsPerMinute / 60 });
        }
        if (config?.llmTokensPerMinute) {
            this.llmTokenBucket.syncConfig({ capacity: config.llmTokensPerMinute, refillRate: config.llmTokensPerMinute / 60 });
        }
    }
}

export default RateLimitManager;
