import TokenBucket from './TokenBucket.js';
import { sleep } from './Utility.js';

export interface RateLimitConfig {
    requestsPerMinute?: number;
    llmTokensPerMinute?: number;
}

export interface AcquireResult {
    totalWaitMs: number;
}

class RateLimitManager {
    static #instances = new Map<string, RateLimitManager>();

    requestBucket: TokenBucket;
    llmTokenBucket: TokenBucket;

    constructor({ requestsPerMinute = 60, llmTokensPerMinute = 150000 }: RateLimitConfig = {}) {
        this.requestBucket = new TokenBucket(requestsPerMinute, requestsPerMinute / 60);
        this.llmTokenBucket = new TokenBucket(llmTokensPerMinute, llmTokensPerMinute / 60);
    }

    static getInstance(bucketId: string, config?: RateLimitConfig): RateLimitManager {
        if (!this.#instances.has(bucketId)) {
            this.#instances.set(bucketId, new RateLimitManager(config));
        } else if (config) {
            this.#instances.get(bucketId)!.syncConfig(config);
        }
        return this.#instances.get(bucketId)!;
    }

    static clear(bucketId: string): void {
        this.#instances.delete(bucketId);
    }

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

        if (abortSignal?.aborted) {
            const error = new Error(abortSignal.reason || 'Operation was aborted');
            error.name = 'AbortError';
            throw error;
        }

        return { totalWaitMs: waitTime };
    }

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
