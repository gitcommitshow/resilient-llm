import ResilientLLM from '../ResilientLLM.js';
import {jest, describe, expect, test, beforeEach} from '@jest/globals';

describe('ResilientLLM Async Function Tests', () => {
    let llm;

    beforeEach(() => {
        llm = new ResilientLLM({
            aiService: 'openai',
            retries: 1
        });
    });

    test('should execute simple async function and return correct value', async () => {
        // Create a simple async function that returns a string
        const simpleAsyncFunction = async () => {
            return 'Hello, World!';
        };

        // Execute the async function using ResilientOperation
        const result = await llm.resilientOperation.execute(simpleAsyncFunction);

        // Verify the result
        expect(result).toBe('Hello, World!');
    });

    test('should execute async function with parameters', async () => {
        // Create an async function that takes parameters
        const asyncAdd = async (a, b) => {
            return a + b;
        };

        // Execute with parameters
        const result = await llm.resilientOperation.execute(asyncAdd, 5, 3);

        // Verify the result
        expect(result).toBe(8);
    });

    test('should execute async function that returns object', async () => {
        // Create an async function that returns an object
        const asyncObjectFunction = async () => {
            return { status: 'success', data: [1, 2, 3] };
        };

        // Execute the function
        const result = await llm.resilientOperation.execute(asyncObjectFunction);

        // Verify the result
        expect(result).toEqual({ status: 'success', data: [1, 2, 3] });
        expect(result.status).toBe('success');
        expect(result.data).toHaveLength(3);
    });

    test('should execute async function with delay', async () => {
        // Create an async function with a small delay
        const asyncDelayFunction = async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return 'Completed after delay';
        };

        // Execute the function
        const result = await llm.resilientOperation.execute(asyncDelayFunction);

        // Verify the result
        expect(result).toBe('Completed after delay');
    });
}); 