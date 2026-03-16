export interface TokenBucketConfig {
    capacity: number;
    refillRate: number;
}

/**
 * Token Bucket Algorithm implementation.
 * Rate limiting technique: a bucket holds tokens; each request consumes tokens.
 * If the bucket is empty, the request is rejected. The bucket refills at a fixed rate.
 *
 * @param capacity - Maximum number of tokens the bucket can hold
 * @param refillRate - Tokens added per second
 * @example
 * const tokenBucket = new TokenBucket(100, 10);
 * tokenBucket.tryRemoveToken(10); // true - 10 tokens removed
 * tokenBucket.tryRemoveToken(91); // false - not enough tokens
 * tokenBucket.syncConfig({ capacity: 200, refillRate: 20 });
 */
class TokenBucket {
    capacity: number;
    refillRate: number;
    /** Current number of tokens in the bucket */
    availableTokens: number;
    /** Timestamp of the last refill */
    lastRefill: number;

    constructor(capacity: number, refillRate: number) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.availableTokens = capacity;
        this.lastRefill = Date.now();
    }

    tryRemoveToken(count: number = 1): boolean {
        if (count > this.capacity) {
            const error = new Error('Cannot remove more tokens than the bucket capacity');
            error.name = 'OversizedRequestError';
            throw error;
        }
        if (this.getAvailableTokens() >= count) {
            this.availableTokens -= count;
            return true;
        }
        return false;
    }

    getAvailableTokens(): number {
        this._refill();
        return this.availableTokens;
    }

    refundTokens(count: number = 1): void {
        if (count <= 0) return;
        this._refill();
        this.availableTokens = Math.min(this.capacity, this.availableTokens + count);
    }

    private _refill(): void {
        const now = Date.now();
        const timeSinceLastRefill = now - this.lastRefill;
        const tokensToAdd = Math.floor(timeSinceLastRefill / 1000) * this.refillRate;
        if (tokensToAdd > 0) {
            this.availableTokens = Math.min(this.capacity, this.availableTokens + tokensToAdd);
            this.lastRefill = now;
        }
    }

    /**
     * Adjust capacity and refill rate without resetting current token count.
     * Clamps tokens to new capacity if it shrank; preserves drain state otherwise.
     */
    syncConfig({ capacity, refillRate }: Partial<TokenBucketConfig>): void {
        if (this.capacity && capacity !== undefined && capacity !== this.capacity) this.capacity = capacity;
        if (this.refillRate && refillRate !== undefined && refillRate !== this.refillRate) this.refillRate = refillRate;
        if (capacity !== undefined && this.availableTokens > capacity) this.availableTokens = capacity;
    }
}

export default TokenBucket;
