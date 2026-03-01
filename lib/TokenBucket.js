/**
 * @summary
 * Token Bucket Algorithm implementation
 * @description
 * The token bucket algorithm is a rate limiting technique that allows you to limit the rate of requests to a resource.
 * It works by maintaining a bucket of tokens, and each request consumes one token.
 * If the bucket is empty, the request is rejected.
 * The bucket is refilled at a rate determined by the refill rate.
 * The capacity is the maximum number of tokens the bucket can hold.
 * The refill rate is the rate at which tokens are added to the bucket.
 * @param {number} capacity - The maximum number of tokens the bucket can hold
 * @param {number} refillRate - The rate at which tokens are added to the bucket
 * @example
 * const tokenBucket = new TokenBucket(100, 10);
 * tokenBucket.tryRemoveToken(10); // true - 10 tokens removed from the bucket
 * tokenBucket.tryRemoveToken(91); // false - not enough tokens remaining in the bucket
 * tokenBucket.syncConfig({ capacity: 200, refillRate: 20 });
 * tokenBucket.tryRemoveToken(91); // true
 */
class TokenBucket {
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.availableTokens = capacity; // current number of tokens in the bucket
        this.lastRefill = Date.now(); // timestamp of the last refill
    }

    tryRemoveToken(count = 1) {
        if(count > this.capacity) {
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

    getAvailableTokens() {
        this._refill();
        return this.availableTokens;
    }

    refundTokens(count = 1) {
        if (count <= 0) return;
        this._refill();
        this.availableTokens = Math.min(this.capacity, this.availableTokens + count);
    }

    _refill() {
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
    syncConfig({ capacity, refillRate }) {
        if(this.capacity && capacity!==this.capacity) this.capacity = capacity;
        if(this.refillRate && refillRate!==this.refillRate) this.refillRate = refillRate;
        if (this.availableTokens > capacity) this.availableTokens = capacity;
    }
}
export default TokenBucket;