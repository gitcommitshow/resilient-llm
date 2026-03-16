/**
 * Circuit Breaker implementation with configurable failure thresholds and cooldown periods.
 * Used to fail fast when a service is unhealthy and allow it to recover.
 */

export interface CircuitBreakerConfig {
    failureThreshold?: number;
    cooldownPeriod?: number;
    name?: string;
}

export interface CircuitBreakerStatus {
    isOpen: boolean;
    failCount: number;
    failureThreshold: number;
    cooldownRemaining: number;
    lastFailureTime: number | null;
    name: string;
}

class CircuitBreaker {
    static #instances = new Map<string, CircuitBreaker>(); // bucketId -> instance

    failureThreshold: number;
    cooldownPeriod: number;
    name: string;
    failCount: number;
    isOpen: boolean;
    openedAt: number | null;
    lastFailureTime: number | null;

    constructor({
        failureThreshold = 5,
        cooldownPeriod = 30000,
        name = 'default'
    }: CircuitBreakerConfig = {}) {
        this.failureThreshold = failureThreshold;
        this.cooldownPeriod = cooldownPeriod;
        this.name = name;

        this.failCount = 0;
        this.isOpen = false;
        this.openedAt = null;
        this.lastFailureTime = null;
    }

    /**
     * Get or create a circuit breaker instance for the given bucketId.
     * @param bucketId - The service identifier
     * @param config - Circuit breaker configuration (merged if instance exists)
     * @returns The circuit breaker instance for that bucket
     */
    static getInstance(bucketId: string, config?: CircuitBreakerConfig): CircuitBreaker {
        if (!this.#instances.has(bucketId)) {
            this.#instances.set(bucketId, new CircuitBreaker({
                ...config,
                name: `CircuitBreaker-${bucketId}`
            }));
        } else if (config) {
            this.#instances.get(bucketId)!.syncConfig(config);
        }
        return this.#instances.get(bucketId)!;
    }

    /**
     * Clear a circuit breaker instance for the given bucketId.
     * @param bucketId - The service identifier
     */
    static clear(bucketId: string): void {
        this.#instances.delete(bucketId);
    }

    /**
     * Check if the circuit breaker is open; resets if cooldown period has expired.
     * @returns true if circuit is open, false if closed (or after cooldown)
     */
    isCircuitOpen(): boolean {
        if (!this.isOpen) return false;

        if (Date.now() - this.openedAt! > this.cooldownPeriod) {
            this._reset();
            return false;
        }

        return true;
    }

    /** Record a successful operation (resets failure count and closes if open after cooldown). */
    recordSuccess(): void {
        this._reset();
    }

    /** Record a failed operation; opens circuit when failure threshold is reached. */
    recordFailure(): void {
        this.failCount++;
        this.lastFailureTime = Date.now();

        if (this.failCount >= this.failureThreshold) {
            this._open();
        }
    }

    /** Get current circuit breaker status (open/closed, fail count, cooldown remaining, etc.). */
    getStatus(): CircuitBreakerStatus {
        return {
            isOpen: this.isCircuitOpen(),
            failCount: this.failCount,
            failureThreshold: this.failureThreshold,
            cooldownRemaining: this.isOpen
                ? Math.max(0, this.cooldownPeriod - (Date.now() - this.openedAt!))
                : 0,
            lastFailureTime: this.lastFailureTime,
            name: this.name
        };
    }

    /** Manually open the circuit breaker. */
    forceOpen(): void {
        this._open();
    }

    /** Manually close the circuit breaker. */
    forceClose(): void {
        this._reset();
    }

    /**
     * Update threshold and cooldown config without resetting state.
     * Called by getInstance when per-request config differs from the original.
     */
    syncConfig({ failureThreshold, cooldownPeriod }: CircuitBreakerConfig = {}): void {
        if (failureThreshold !== undefined) this.failureThreshold = failureThreshold;
        if (cooldownPeriod !== undefined) this.cooldownPeriod = cooldownPeriod;
    }

    private _reset(): void {
        this.isOpen = false;
        this.failCount = 0;
        this.openedAt = null;
    }

    private _open(): void {
        this.isOpen = true;
        this.openedAt = Date.now();
    }
}

export default CircuitBreaker;