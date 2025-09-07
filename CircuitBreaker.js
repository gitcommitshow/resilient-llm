/**
 * Circuit Breaker implementation with configurable failure thresholds and cooldown periods
 */
class CircuitBreaker {
    static #instances = new Map(); // bucketId -> instance
    
    constructor({
        failureThreshold = 5,
        cooldownPeriod = 30000,
        name = 'default'
    }) {
        this.failureThreshold = failureThreshold;
        this.cooldownPeriod = cooldownPeriod;
        this.name = name;
        
        // State
        this.failCount = 0;
        this.isOpen = false;
        this.openedAt = null;
        this.lastFailureTime = null;
    }
    
    /**
     * Get or create a circuit breaker instance for the given bucketId
     * @param {string} bucketId - The service identifier
     * @param {Object} config - Circuit breaker configuration
     * @returns {CircuitBreaker} - The circuit breaker instance
     */
    static getInstance(bucketId, config) {
        if (!this.#instances.has(bucketId)) {
            this.#instances.set(bucketId, new CircuitBreaker({
                ...config,
                name: `CircuitBreaker-${bucketId}`
            }));
        }
        return this.#instances.get(bucketId);
    }
    
    /**
     * Clear a circuit breaker instance for the given bucketId
     * @param {string} bucketId - The service identifier
     */
    static clear(bucketId) {
        this.#instances.delete(bucketId);
    }

    /**
     * Check if the circuit breaker is open, reset if cooldown period has expired
     * @returns {boolean} - True if circuit is open, false if closed
     */
    isCircuitOpen() {
        if (!this.isOpen) return false;
        
        // Check if cooldown period has expired
        if (Date.now() - this.openedAt > this.cooldownPeriod) {
            this._reset();
            return false;
        }
        
        return true;
    }

    /**
     * Record a successful operation
     */
    recordSuccess() {
        this._reset();
    }

    /**
     * Record a failed operation
     */
    recordFailure() {
        this.failCount++;
        this.lastFailureTime = Date.now();
        
        if (this.failCount >= this.failureThreshold) {
            this._open();
        }
    }

    /**
     * Get current circuit breaker status
     * @returns {Object} - Status information
     */
    getStatus() {
        return {
            isOpen: this.isCircuitOpen(),
            failCount: this.failCount,
            failureThreshold: this.failureThreshold,
            cooldownRemaining: this.isOpen ? 
                Math.max(0, this.cooldownPeriod - (Date.now() - this.openedAt)) : 0,
            lastFailureTime: this.lastFailureTime,
            name: this.name
        };
    }

    /**
     * Manually open the circuit breaker
     */
    forceOpen() {
        this._open();
    }

    /**
     * Manually close the circuit breaker
     */
    forceClose() {
        this._reset();
    }

    /**
     * Reset circuit breaker to closed state
     * @private
     */
    _reset() {
        this.isOpen = false;
        this.failCount = 0;
        this.openedAt = null;
    }

    /**
     * Open the circuit breaker
     * @private
     */
    _open() {
        this.isOpen = true;
        this.openedAt = Date.now();
    }
}

export default CircuitBreaker;