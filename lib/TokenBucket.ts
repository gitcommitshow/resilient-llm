export interface TokenBucketConfig {
    capacity: number;
    refillRate: number;
}

class TokenBucket {
    capacity: number;
    refillRate: number;
    availableTokens: number;
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

    syncConfig({ capacity, refillRate }: Partial<TokenBucketConfig>): void {
        if (this.capacity && capacity !== undefined && capacity !== this.capacity) this.capacity = capacity;
        if (this.refillRate && refillRate !== undefined && refillRate !== this.refillRate) this.refillRate = refillRate;
        if (capacity !== undefined && this.availableTokens > capacity) this.availableTokens = capacity;
    }
}

export default TokenBucket;
