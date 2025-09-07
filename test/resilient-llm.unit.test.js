import ResilientLLM from '../ResilientLLM.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

// Configure chai to handle promises
use(chaiAsPromised);

describe('ResilientLLM Unit Tests', () => {
    let resilientLLM;
    let originalEnv;
    let mockFetch;
    let mockAnthropicResponse;

    beforeEach(() => {
        // Save original environment
        originalEnv = { ...process.env };
        
        // Set up test environment
        process.env.ANTHROPIC_API_KEY = 'test-key';
        process.env.MAX_INPUT_TOKENS = '100000';
        
        resilientLLM = new ResilientLLM({
            aiService: 'anthropic',
            model: 'claude-3-5-sonnet-20240620',
            maxTokens: 2048,
            temperature: 0
        });

        mockAnthropicResponse = {
            content: [
                { text: 'Hello! How can I help you today?' }
            ]
        };

        mockFetch = sinon.stub().resolves({
            json: () => Promise.resolve(mockAnthropicResponse),
            status: 200
        });

        global.fetch = mockFetch;
    });

    afterEach(() => {
        // Restore original environment
        process.env = originalEnv;
        sinon.restore();
    });

    describe('Happy Path Tests', () => {
        it('should successfully complete a chat request and return parsed response', async () => {
            // Arrange
            const conversationHistory = [
                { role: 'user', content: 'Hello, world!' }
            ];

            // Act
            const result = await resilientLLM.chat(conversationHistory);

            // Assert
            expect(result).to.equal(mockAnthropicResponse.content[0].text);
            expect(mockFetch.callCount).to.be.equal(1);
        });
    });

    describe('Edge Case Tests', () => {
        it('should throw error when input tokens exceed maximum limit', async () => {
            // Arrange
            const longText = 'a'.repeat(500000); // Very long text to exceed token limit
            const conversationHistory = [
                { role: 'user', content: longText }
            ];

            // Act & Assert
            await expect(resilientLLM.chat(conversationHistory))
                .to.be.rejectedWith('Input tokens exceed the maximum limit of 100000');
            expect(mockFetch.callCount).to.be.equal(0);
        });

        it('should retry with alternate service when primary service returns rate limit error', async () => {
            // Arrange
            const conversationHistory = [
                { role: 'user', content: 'Test message' }
            ];

            // Update fetch to return rate limit error
            mockFetch.resolves({
                json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
                status: 429
            });
            
            // Mock the retry method to return success
            sinon.stub(resilientLLM, 'retryChatWithAlternateService').resolves(mockAnthropicResponse.content[0].text);

            // Act
            const result = await resilientLLM.chat(conversationHistory);

            // Assert
            expect(result).to.equal(mockAnthropicResponse.content[0].text);
            expect(resilientLLM.retryChatWithAlternateService.calledOnce).to.be.true;
            expect(mockFetch.callCount).to.be.equal(1);
        });
    });
}); 