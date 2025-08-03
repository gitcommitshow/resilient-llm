import ResilientOperation from '../ResilientOperation.js';
import { jest, describe, expect, test, beforeEach } from '@jest/globals';

describe('ResilientOperation E2E Tests', () => {
  let resilientOp;
  let mockRateLimitUpdate;

  beforeEach(() => {
    mockRateLimitUpdate = jest.fn();
    resilientOp = new ResilientOperation({
      bucketId: 'test-bucket',
      rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
      retries: 2,
      timeout: 3000,
      backoffFactor: 2,
      onRateLimitUpdate: mockRateLimitUpdate,
    });
  });

  describe('Test 1: Basic Retry Logic', () => {
    test('should retry failed calls and eventually succeed', async () => {
      // Create a ResilientOperation with longer timeout for this specific test
      const testResilientOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 15000, // Longer timeout for this retry test
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
      });

      let callCount = 0;
      const mockAsyncFn = jest.fn().mockImplementation(async (apiUrl, requestBody, headers) => {
        console.log('apiUrl', apiUrl);
        console.log('requestBody', requestBody);
        console.log('headers', headers);
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
      
      // Should have called the function 3 times (2 failures + 1 success)
      expect(mockAsyncFn).toHaveBeenCalledTimes(3);
      // Test arguments passed to the function
      expect(mockAsyncFn).toHaveBeenCalledWith(...asynFnArgs);
      expect(result).toEqual({ data: 'success' });
    }, 10000);

    test('should handle rate limit errors with retry', async () => {
      let callCount = 0;
      const mockAsyncFn = jest.fn().mockImplementation(async () => {
        callCount++;
        
        // Simulate rate limit error on first call, success on second
        if (callCount === 1) {
          const error = new Error('Rate limit exceeded');
          error.response = {
            status: 429,
            headers: {
              get: jest.fn().mockReturnValue('1') // retry after 1 second
            }
          };
          throw error;
        }
        
        return { data: 'success' };
      });

      const result = await resilientOp.execute(mockAsyncFn);
      
      expect(mockAsyncFn).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ data: 'success' });
    }, 10000);
  });

  describe('Test 2: Circuit Breaker', () => {
    test('should open circuit breaker after too many failures', async () => {
      const mockAsyncFn = jest.fn().mockImplementation(async () => {
        const error = new Error('Service down');
        error.response = { status: 500 };
        throw error;
      });
      
      // Make 6 calls - first 5 should fail and increment fail count
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(resilientOp.execute(mockAsyncFn).catch(err => err));
      }
      
      const results = await Promise.all(promises);
      
      // All calls should fail
      expect(results.length).toBe(6);
      expect(results.every(r => r instanceof Error)).toBe(true);
      
      // Circuit breaker should be open after 5 failures
      expect(resilientOp.circuitOpen).toBe(true);
      expect(resilientOp.failCount).toBeGreaterThan(5);
      
      // Debug: Log the actual failCount to understand what's happening
      console.log('Circuit breaker state:', {
        circuitOpen: resilientOp.circuitOpen,
        failCount: resilientOp.failCount,
        circuitBreakerThreshold: resilientOp.circuitBreakerThreshold
      });
    }, 10000);

    test('should not open circuit breaker with mixed success/failure', async () => {
      // Create a fresh ResilientOperation to avoid interference from previous test
      const freshResilientOp = new ResilientOperation({
        bucketId: 'test-bucket',
        rateLimitConfig: { requestsPerMinute: 10, llmTokensPerMinute: 150000 },
        retries: 2,
        timeout: 3000,
        backoffFactor: 2,
        onRateLimitUpdate: mockRateLimitUpdate,
        cacheStore: {}, // Ensure no caching
      });
      
      // Set a higher circuit breaker threshold to account for retry failures
      freshResilientOp.circuitBreakerThreshold = 15;

      let callCount = 0;
      const mockAsyncFn = jest.fn().mockImplementation(async () => {
        callCount++;
        
        // Fail every 3rd call with server error, succeed otherwise
        if (callCount % 3 === 0) {
          console.log(`Call ${callCount} is FAILING`);
          const error = new Error('Server error');
          error.response = { status: 500 };
          throw error;
        }
        console.log(`Call ${callCount} is SUCCEEDING`);
        return { data: 'success' };
      });
      
      // Disable retries for this test to see the actual failure pattern
      freshResilientOp.retries = 0;
      
      console.log('Mock function created, callCount starts at 0');
      
      const promises = [];
      for (let i = 0; i < 6; i++) {
        console.log(`Starting call ${i + 1}`);
        promises.push(freshResilientOp.execute(mockAsyncFn).catch(err => {
          console.log(`Call ${i + 1} failed:`, err.message);
          return err;
        }));
      }
      
      const results = await Promise.all(promises);
      
      // Debug: Check circuit breaker state immediately after execution
      console.log('Circuit breaker state after execution:', {
        circuitOpen: freshResilientOp.circuitOpen,
        failCount: freshResilientOp.failCount,
        circuitBreakerThreshold: freshResilientOp.circuitBreakerThreshold
      });
      
      // Circuit should remain closed due to mixed success/failure
      expect(freshResilientOp.circuitOpen).toBe(false);
      expect(freshResilientOp.failCount).toBeLessThan(5);
      
      // Should have both successes and failures
      const successCount = results.filter(r => r && r.data === 'success').length;
      const failureCount = results.filter(r => r instanceof Error).length;
      
      // Debug: Log each result
      console.log('Individual results:');
      results.forEach((result, index) => {
        console.log(`Result ${index + 1}:`, result instanceof Error ? 'Error' : 'Success', result);
      });
      
      // Debug: Log what we got
      console.log('Mixed success/failure test results:', {
        totalResults: results.length,
        successCount,
        failureCount,
        circuitOpen: freshResilientOp.circuitOpen,
        failCount: freshResilientOp.failCount,
        results: results.map(r => r instanceof Error ? 'Error' : 'Success')
      });
      
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Test 3: Caching', () => {
    test('should cache results and avoid duplicate API calls', async () => {
      const cacheStore = {};
      const cachedResilientOp = new ResilientOperation({
        bucketId: 'cache-test',
        cacheStore,
      });
      
      let callCount = 0;
      const mockAsyncFn = jest.fn().mockImplementation(async () => {
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
      
      expect(result1.data).toBe('cached result');
      expect(callCount).toBe(1);
      
      // Second call with same parameters - should return cached result
      const result2 = await cachedResilientOp
        .withCache()
        .execute(mockAsyncFn, 'https://api.example.com/test', { test: 'data' }, { 'Content-Type': 'application/json' });
      
      expect(result2.data).toBe('cached result');
      expect(callCount).toBe(1); // Should not have called the function again
      
      // Verify cache store has the entry
      expect(Object.keys(cacheStore).length).toBe(1);
    }, 10000);

    test('should apply different preset configurations', async () => {
      const presetResilientOp = new ResilientOperation({
        bucketId: 'preset-test',
      });
      
      const mockAsyncFn = jest.fn().mockResolvedValue({ data: 'success' });
      
      // Test fast preset
      const fastResult = await presetResilientOp
        .preset('fast')
        .execute(mockAsyncFn);
      
      expect(fastResult).toEqual({ data: 'success' });
      
      // Test reliable preset
      const reliableResult = await presetResilientOp
        .preset('reliable')
        .execute(mockAsyncFn);
      
      expect(reliableResult).toEqual({ data: 'success' });
      
      // Test that presets are different by checking the preset definitions
      expect(presetResilientOp.presets.fast.timeout).toBe(10000);
      expect(presetResilientOp.presets.fast.retries).toBe(1);
      expect(presetResilientOp.presets.reliable.timeout).toBe(300000);
      expect(presetResilientOp.presets.reliable.retries).toBe(5);
    }, 10000);
  });
});
