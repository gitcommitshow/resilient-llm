import ResilientOperation from '../ResilientOperation.js';
import CircuitBreaker from '../CircuitBreaker.js';
import RateLimitManager from '../RateLimitManager.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

// Configure chai to handle promises
use(chaiAsPromised);

describe('ResilientOperation E2E Tests', () => {
  let resilientOp;
  let mockRateLimitUpdate;

  beforeEach(() => {
    mockRateLimitUpdate = sinon.stub();
    // Clear shared resources for clean test state
    CircuitBreaker.clear('test-bucket');
    RateLimitManager.clear('test-bucket');
    ResilientOperation.clearConcurrencyCounts('test-bucket');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Test 1: Basic Retry Logic', () => {
    // Happy path test
    it('should retry failed calls and eventually succeed', async () => {
      // Create a ResilientOperation with longer timeout for this specific test
      const testResilientOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 15000, // Longer timeout for this retry test
        backoffFactor: 2
      });

      let callCount = 0;
      const mockAsyncFn = sinon.stub().callsFake(async (apiUrl, requestBody, headers) => {
        callCount++;
        
        // Fail first 2 times with server error (5xx), succeed on 3rd try
        if (callCount <= 2) {
          const error = new Error('Server error');
          error.response = { status: 500 };
          throw error;
        }
        
        return { data: 'success' };
      });
      const asynFnArgs = ["https://api.example.com/test", { test: 'data' }, { 'Content-Type': 'application/json' }];
      const result = await testResilientOp.execute(mockAsyncFn, ...asynFnArgs);
      // Wait for 40s
      await new Promise(resolve => setTimeout(resolve, 40000));
      // Should have called the function 3 times (2 failures + 1 success)
      sinon.assert.calledThrice(mockAsyncFn);
      // Test arguments passed to the function
      sinon.assert.calledWith(mockAsyncFn, ...asynFnArgs);
      expect(result).to.deep.equal({ data: 'success' });
    }).timeout(60000);

    // Edge case 1: Rate limit error test
    it('should handle rate limit errors with retry', async () => {
      // Create a new instance for this test
      const rateLimitOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
      });
      
      let callCount = 0;
      const mockAsyncFn = sinon.stub().callsFake(async () => {
        callCount++;
        
        // Simulate rate limit error on first call, success on second
        if (callCount === 1) {
          const error = new Error('Rate limit exceeded');
          error.response = {
            status: 429,
            headers: {
              get: sinon.stub().returns('1') // retry after 1 second
            }
          };
          throw error;
        }
        
        return { data: 'success' };
      });

      const result = await rateLimitOp.execute(mockAsyncFn);
      
      sinon.assert.calledTwice(mockAsyncFn);
      expect(result).to.deep.equal({ data: 'success' });
    }).timeout(60000);
  });

  describe('Test 2: Circuit Breaker', () => {
    // Happy path: Circuit breaker open test
    it('should open circuit breaker after too many failures', async () => {
      // Create a new instance for this test
      const circuitBreakerOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
      });
      
      const mockAsyncFn = sinon.stub().callsFake(async () => {
        const error = new Error('Service down');
        error.response = { status: 500 };
        throw error;
      });
      
      // Make 6 calls - each gets a fresh instance but shares circuit breaker
      const promises = [];
      for (let i = 0; i < 6; i++) {
        const operation = new ResilientOperation({
          bucketId: 'test-bucket',
          rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
          retries: 2,
          timeout: 3000,
          backoffFactor: 2,
          onRateLimitUpdate: mockRateLimitUpdate,
        });
        promises.push(operation.execute(mockAsyncFn).catch(err => err));
      }
      
      const results = await Promise.all(promises);
      
      // All calls should fail
      expect(results).to.have.length(6);
      expect(results.every(r => r instanceof Error)).to.be.true;
      
      // Circuit breaker should be open after 5 failures (shared across instances)
      const circuitBreakerStatus = circuitBreakerOp.circuitBreaker.getStatus();
      expect(circuitBreakerStatus.isOpen).to.be.true;
      expect(circuitBreakerStatus.failCount).to.be.greaterThan(5);
      
      // Debug: Log the actual failCount to understand what's happening
      // console.log('Circuit breaker state:', circuitBreakerStatus);
    }).timeout(60000);

    // Circuit breaker not open test
    it('should not open circuit breaker with mixed success/failure', async () => {
      // Create a fresh ResilientOperation to avoid interference from previous test
      const freshResilientOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
        cacheStore: {}, // Ensure no caching
        circuitBreakerConfig: { failureThreshold: 15, cooldownPeriod: 30000 }, // Set higher threshold
      });
      
      let callCount = 0;
      const mockAsyncFn = sinon.stub().callsFake(async () => {
        callCount++;
        
        // Fail every 3rd call with server error, succeed otherwise
        if (callCount % 3 === 0) {
          const error = new Error('Server error');
          error.response = { status: 500 };
          throw error;
        }
        // console.log(`Call ${callCount} is SUCCEEDING`);
        return { data: 'success' };
      });
      
      // Disable retries for this test to see the actual failure pattern
      freshResilientOp.retries = 0;
      
      // console.log('Mock function created, callCount starts at 0');
      
      const promises = [];
      for (let i = 0; i < 6; i++) {
        // console.log(`Starting call ${i + 1}`);
        // Create fresh instance for each call but share circuit breaker
        const operation = new ResilientOperation({
          bucketId: 'test-bucket',
          rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
          retries: 0, // Disable retries for this test
          timeout: 3000,
          backoffFactor: 2,
          onRateLimitUpdate: mockRateLimitUpdate,
          cacheStore: {},
          circuitBreakerConfig: { failureThreshold: 15, cooldownPeriod: 30000 },
        });
        promises.push(operation.execute(mockAsyncFn).catch(err => {
          // console.log(`Call ${i + 1} failed:`, err.message);
          return err;
        }));
      }
      
      const results = await Promise.all(promises);
      
      // Debug: Check circuit breaker state immediately after execution
      const circuitBreakerStatus = freshResilientOp.circuitBreaker.getStatus();
      // console.log('Circuit breaker state after execution:', circuitBreakerStatus);
      
      // Circuit should remain closed due to mixed success/failure
      expect(circuitBreakerStatus.isOpen).to.be.false;
      expect(circuitBreakerStatus.failCount).to.be.lessThan(5);
      
      // Should have both successes and failures
      const successCount = results.filter(r => r && r.data === 'success').length;
      const failureCount = results.filter(r => r instanceof Error).length;
      
      // Debug: Log each result
      // console.log('Individual results:');
      // results.forEach((result, index) => {
      //   console.log(`Result ${index + 1}:`, result instanceof Error ? 'Error' : 'Success', result);
      // });
      
      // // Debug: Log what we got
      // console.log('Mixed success/failure test results:', {
      //   totalResults: results.length,
      //   successCount,
      //   failureCount,
      //   circuitBreakerStatus,
      //   results: results.map(r => r instanceof Error ? 'Error' : 'Success')
      // });
      
      expect(successCount).to.be.greaterThan(0);
      expect(failureCount).to.be.greaterThan(0);
    }).timeout(50000);

    // Circuit breaker close test
    it('should close circuit breaker after cooldown period', async () => {
      // Create a ResilientOperation with short cooldown for testing
      const testResilientOp = new ResilientOperation({
        bucketId: 'cooldown-test',
        circuitBreakerConfig: { failureThreshold: 3, cooldownPeriod: 3000 }, // 1 second cooldown
        retries: 0, // Disable retries to see pure circuit breaker behavior
      });

      const mockAsyncFn = sinon.stub().callsFake(async () => {
        const error = new Error('Service down');
        error.response = { status: 500 };
        throw error;
      });

      // Make enough calls to open the circuit breaker
      const promises = [];
      for (let i = 0; i < 4; i++) {
        promises.push(testResilientOp.execute(mockAsyncFn).catch(err => err));
      }
      
      await Promise.all(promises);
      
      // Circuit breaker should be open
      let status = testResilientOp.circuitBreaker.getStatus();
      expect(status.isOpen).to.be.true;
      expect(status.failCount).to.be.at.least(3);
      
      // Wait for cooldown period to expire
      await new Promise(resolve => setTimeout(resolve, 3100));
      
      // Circuit breaker should automatically close
      status = testResilientOp.circuitBreaker.getStatus();
      expect(status.isOpen).to.be.false;
      expect(status.failCount).to.equal(0);
    }).timeout(10000);

    // Circuit breaker open test
    it('should exit immediately when circuit breaker is open (no infinite loop)', async () => {
      // Create a ResilientOperation with low failure threshold
      const operation = new ResilientOperation({
        bucketId: 'test-bucket',
        circuitBreakerConfig: { 
          failureThreshold: 2,  // Open circuit after 2 failures
          cooldownPeriod: 30000 
        },
        retries: 5,  // Allow many retries to test loop behavior
        timeout: 10000,
        rateLimitConfig: { requestsPerMinute: 1000, llmTokensPerMinute: 1000000 },
        onRateLimitUpdate: mockRateLimitUpdate,
      });

      // Mock function that always fails and tracks calls
      let functionCallCount = 0;
      const failingFunction = sinon.stub().callsFake(async () => {
        functionCallCount++;
        console.log(`failingFunction called - attempt #${functionCallCount}`);
        const error = new Error('Simulated failure');
        error.response = { status: 500 };
        throw error;
      });

      // First, trigger enough failures to open the circuit breaker
      console.log('=== Triggering circuit breaker to open ===');
      
      // Make 1 call - with retries=5 and failureThreshold=2, this single call will:
      // - Try once: failCount=1
      // - Retry 1: failCount=2 → Circuit breaker opens!
      try {
        await operation.execute(failingFunction);
      } catch (err) {
        console.log(`Call failed as expected: ${err.message}`);
      }

      // Verify circuit breaker is open
      const status = operation.circuitBreaker.getStatus();
      console.log('Circuit breaker status:', status);
      expect(status.isOpen).to.be.true;
      expect(status.failCount).to.be.greaterThanOrEqual(2);

      // Record function call count before the test
      const callCountBefore = functionCallCount;
      console.log(`Function calls before circuit breaker test: ${callCountBefore}`);

      // Now test the critical behavior - this should exit immediately, not loop infinitely
      console.log('=== Testing circuit breaker open behavior ===');
      
      const startTime = Date.now();
      let errorThrown = false;
      let failureCountBefore = status.failCount;
      
      try {
        await operation.execute(failingFunction);
      } catch (err) {
        errorThrown = true;
        console.log('Error caught:', err.message);
        expect(err.message).to.equal('Circuit breaker is open');
      }
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log(`Execution time: ${executionTime}ms`);
      
      // The operation should fail immediately (within 100ms) due to circuit breaker
      // If it takes longer, it means it's stuck in an infinite loop
      expect(errorThrown).to.be.true;
      expect(executionTime).to.be.lessThan(1000); // Should be very fast, not stuck in loop
      
      // Verify circuit breaker status hasn't changed (no additional failures recorded)
      const finalStatus = operation.circuitBreaker.getStatus();
      expect(finalStatus.failCount).to.equal(failureCountBefore); // Should not have incremented
      
      // Verify the failing function was NOT called again (since circuit breaker was open)
      const callCountAfter = functionCallCount;
      console.log(`Function calls after circuit breaker test: ${callCountAfter}`);
      expect(callCountAfter).to.equal(callCountBefore); // Should be the same - no new calls!
      
      // Additional verification: Wait a bit and ensure no delayed calls happen
      console.log('=== Waiting to ensure no delayed function calls ===');
      await new Promise(resolve => setTimeout(resolve, 100));
      const callCountAfterDelay = functionCallCount;
      console.log(`Function calls after 100ms delay: ${callCountAfterDelay}`);
      expect(callCountAfterDelay).to.equal(callCountBefore); // Still no new calls!
    }).timeout(45000);
  });

  describe('Test 3: Caching', () => {
    // Caching test
    it('should cache results and avoid duplicate API calls', async () => {
      const cacheStore = {};
      const cachedResilientOp = new ResilientOperation({
        bucketId: 'cache-test',
        cacheStore,
      });
      
      let callCount = 0;
      const mockAsyncFn = sinon.stub().callsFake(async () => {
        callCount++;
        return { 
          data: 'cached result', 
          statusCode: 200,
          apiUrl: 'https://api.example.com/test',
          requestBody: { test: 'data' },
          headers: { 'Content-Type': 'application/json' }
        };
      });
      
      // First call - should execute and cache
      const result1 = await cachedResilientOp
        .withCache()
        .execute(mockAsyncFn, 'https://api.example.com/test', { test: 'data' }, { 'Content-Type': 'application/json' });
      
      expect(result1.data).to.equal('cached result');
      expect(callCount).to.equal(1);
      
      // Second call with same parameters - should return cached result
      const result2 = await cachedResilientOp
        .withCache()
        .execute(mockAsyncFn, 'https://api.example.com/test', { test: 'data' }, { 'Content-Type': 'application/json' });
      
      expect(result2.data).to.equal('cached result');
      expect(callCount).to.equal(1); // Should not have called the function again
      
      // Verify cache store has the entry
      expect(Object.keys(cacheStore)).to.have.length(1);
    }).timeout(60000);

    // Preset configurations test
    it('should apply different preset configurations', async () => {
      const presetResilientOp = new ResilientOperation({
        bucketId: 'preset-test',
      });
      
      const mockAsyncFn = sinon.stub().resolves({ data: 'success' });
      
      // Test fast preset
      const fastResult = await presetResilientOp
        .preset('fast')
        .execute(mockAsyncFn);
      
      expect(fastResult).to.deep.equal({ data: 'success' });
      
      // Test reliable preset
      const reliableResult = await presetResilientOp
        .preset('reliable')
        .execute(mockAsyncFn);
      
      expect(reliableResult).to.deep.equal({ data: 'success' });
      
      // Test that presets are different by checking the preset definitions
      expect(presetResilientOp.presets.fast.timeout).to.equal(10000);
      expect(presetResilientOp.presets.fast.retries).to.equal(1);
      expect(presetResilientOp.presets.reliable.timeout).to.equal(300000);
      expect(presetResilientOp.presets.reliable.retries).to.equal(5);
    }).timeout(60000);
  });

  describe('Test 4: Circuit Breaker Status and Control', () => {
    // Circuit breaker status test
    it('should provide circuit breaker status information', async () => {
      // Create a new instance for this test
      const statusOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
      });
      
      const status = statusOp.circuitBreaker.getStatus();
      
      expect(status).to.have.property('isOpen');
      expect(status).to.have.property('failCount');
      expect(status).to.have.property('failureThreshold');
      expect(status).to.have.property('cooldownRemaining');
      expect(status).to.have.property('lastFailureTime');
      expect(status).to.have.property('name');
      
      // Initial state should be closed
      expect(status.isOpen).to.be.false;
      expect(status.failCount).to.equal(0);
      expect(status.name).to.equal('CircuitBreaker-test-bucket');
    });

    // Circuit breaker control test
    it('should allow manual circuit breaker control', async () => {
      // Create a new instance for this test
      const controlOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
      });
      
      // Force open the circuit breaker
      controlOp.circuitBreaker.forceOpen();
      let status = controlOp.circuitBreaker.getStatus();
      expect(status.isOpen).to.be.true;
      
      // Force close the circuit breaker
      controlOp.circuitBreaker.forceClose();
      status = controlOp.circuitBreaker.getStatus();
      expect(status.isOpen).to.be.false;
      expect(status.failCount).to.equal(0);
    });
  });

  describe('Test 5: Bulkhead Concurrency Control', () => {
    // Bulkhead concurrency control test
    it('should enforce concurrency limits with bulkhead', async () => {
      // Create operations with concurrency limit
      const operations = [];
      for (let i = 0; i < 3; i++) {
        operations.push(new ResilientOperation({
          bucketId: 'test-bucket',
          maxConcurrent: 2, // Only allow 2 concurrent operations
          rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
          retries: 0,
          timeout: 1000,
        }));
      }
      
      const mockAsyncFn = sinon.stub().callsFake(async () => {
        // Simulate a slow operation
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'success' };
      });
      
      // Start all operations concurrently
      const promises = operations.map(op => op.execute(mockAsyncFn));
      
      // The third operation should fail due to concurrency limit
      const results = await Promise.allSettled(promises);
      
      // Two should succeed, one should fail
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      
      expect(successes).to.equal(2);
      expect(failures).to.equal(1);
      
      // Check that the failure is due to concurrency limit
      const failure = results.find(r => r.status === 'rejected');
      expect(failure.reason.message).to.include('Concurrency limit exceeded');
    }).timeout(10000);
    
    // Default concurrency behavior (unlimited) test
    it('should allow unlimited concurrency when maxConcurrent is not set', async () => {
      // Create operations without concurrency limit
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(new ResilientOperation({
          bucketId: 'test-bucket',
          // No maxConcurrent set
          rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
          retries: 0,
          timeout: 1000,
        }));
      }
      
      const mockAsyncFn = sinon.stub().resolves({ data: 'success' });
      
      // Start all operations concurrently
      const promises = operations.map(op => op.execute(mockAsyncFn));
      
      // All should succeed
      const results = await Promise.all(promises);
      
      expect(results).to.have.length(5);
      expect(results.every(r => r.data === 'success')).to.be.true;
    }).timeout(10000);
  });
});
