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
    static #instances = new Map<string, CircuitBreaker>();

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

    static clear(bucketId: string): void {
        this.#instances.delete(bucketId);
    }

    isCircuitOpen(): boolean {
        if (!this.isOpen) return false;

        if (Date.now() - this.openedAt! > this.cooldownPeriod) {
            this._reset();
            return false;
        }

        return true;
    }

    recordSuccess(): void {
        this._reset();
    }

    recordFailure(): void {
        this.failCount++;
        this.lastFailureTime = Date.now();

        if (this.failCount >= this.failureThreshold) {
            this._open();
        }
    }

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

    forceOpen(): void {
        this._open();
    }

    forceClose(): void {
        this._reset();
    }

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
