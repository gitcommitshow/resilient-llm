class TokenBucket {
    constructor(capacity, refillRate) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }

    tryRemoveToken(count = 1) {
        const now = Date.now();
        const timeSinceLastRefill = now - this.lastRefill;
        const tokensToAdd = Math.floor(timeSinceLastRefill / 1000) * this.refillRate;
        if (tokensToAdd > 0) {
            this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
            this.lastRefill = now;
        }
        if (this.tokens >= count) {
            this.tokens -= count;
            return true;
        }
        return false;
    }

    update({ capacity, refillRate }) {
        this.capacity = capacity;
        this.refillRate = refillRate;
        this.tokens = capacity;
        this.lastRefill = Date.now();
    }
}
export default TokenBucket;