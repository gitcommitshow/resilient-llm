import { ResilientLLM, ResilientLLMError } from '../dist/index.js';
import ProviderRegistry from '../dist/lib/ProviderRegistry.js';
import ResilientOperation from '../dist/lib/ResilientOperation.js';
import RateLimitManager from '../dist/lib/RateLimitManager.js';
import CircuitBreaker from '../dist/lib/CircuitBreaker.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

// Configure chai to handle promises
use(chaiAsPromised);

describe('ResilientLLM Chat Function Unit Tests', () => {
    let llm;

    beforeEach(() => {
        llm = new ResilientLLM({
            aiService: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 2048
        });
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('ProviderRegistry URL and API key (use ProviderRegistry for URLs/keys)', () => {
        it('should generate correct API URL for OpenAI via ProviderRegistry', () => {
            const baseUrl = ProviderRegistry.getChatApiUrl('openai');
            const url = ProviderRegistry.buildApiUrl('openai', baseUrl, null);
            expect(url).to.equal('https://api.openai.com/v1/chat/completions');
        });

        it('should generate correct API URL for Anthropic via ProviderRegistry', () => {
            const baseUrl = ProviderRegistry.getChatApiUrl('anthropic');
            const url = ProviderRegistry.buildApiUrl('anthropic', baseUrl, null);
            expect(url).to.equal('https://api.anthropic.com/v1/messages');
        });

        it('should generate correct API URL for Google via ProviderRegistry', () => {
            const baseUrl = ProviderRegistry.getChatApiUrl('google');
            const url = ProviderRegistry.buildApiUrl('google', baseUrl, null);
            expect(url).to.equal('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
        });

        it('should generate correct API URL for Ollama with default URL via ProviderRegistry', () => {
            const baseUrl = ProviderRegistry.getChatApiUrl('ollama');
            const url = ProviderRegistry.buildApiUrl('ollama', baseUrl, null);
            expect(url).to.equal('http://localhost:11434/api/generate');
        });

        it('should generate correct API URL for Ollama with custom URL via ProviderRegistry', () => {
            process.env.OLLAMA_API_URL = 'http://custom-ollama:8080/api/generate';
            const baseUrl = ProviderRegistry.getChatApiUrl('ollama');
            const url = ProviderRegistry.buildApiUrl('ollama', baseUrl, null);
            expect(url).to.equal('http://localhost:11434/api/generate');
        });

        it('should return null for invalid provider getChatApiUrl', () => {
            expect(ProviderRegistry.getChatApiUrl('invalid-service')).to.be.null;
        });

        it('should report hasApiKey true when API key is set via ProviderRegistry', () => {
            process.env.OPENAI_API_KEY = 'test-openai-key';
            expect(ProviderRegistry.hasApiKey('openai')).to.equal(true);
        });

        it('should report hasApiKey false for invalid provider via ProviderRegistry', () => {
            expect(ProviderRegistry.hasApiKey('invalid-service')).to.equal(false);
        });
    });

    describe('Message Formatting', () => {
        it('should format messages for Anthropic correctly', () => {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' },
                { role: 'user', content: 'How are you?' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).to.equal('You are a helpful assistant.');
            expect(formattedMessages).to.have.length(3);
            expect(formattedMessages[0]).to.deep.equal({ role: 'user', content: 'Hello' });
            expect(formattedMessages[1]).to.deep.equal({ role: 'assistant', content: 'Hi there!' });
            expect(formattedMessages[2]).to.deep.equal({ role: 'user', content: 'How are you?' });
        });

        it('should handle messages without system message', () => {
            const messages = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).to.be.undefined;
            expect(formattedMessages).to.have.length(2);
            expect(formattedMessages).to.deep.equal(messages);
        });

        it('should handle empty messages array', () => {
            const messages = [];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).to.be.undefined;
            expect(formattedMessages).to.have.length(0);
        });

        it('should handle multiple system messages (use last one)', () => {
            const messages = [
                { role: 'system', content: 'First system message' },
                { role: 'user', content: 'Hello' },
                { role: 'system', content: 'Second system message' },  // ← This should win
                { role: 'assistant', content: 'Hi there!' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).to.equal('Second system message');  // ← Fixed expectation
            expect(formattedMessages).to.have.length(2);
            expect(formattedMessages[0]).to.deep.equal({ role: 'user', content: 'Hello' });
            expect(formattedMessages[1]).to.deep.equal({ role: 'assistant', content: 'Hi there!' });
        });
    });

    describe('Response Parsing', () => {
        it('should parse OpenAI chat completion response', () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Hello! How can I help you today?',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }],
                usage: {
                    prompt_tokens: 19,
                    completion_tokens: 10,
                    total_tokens: 29
                }
            };

            const result = llm.parseOpenAIChatCompletion(mockResponse);
            expect(result).to.equal('Hello! How can I help you today?');
        });

        it('should parse OpenAI chat completion response with tool calls', () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: null,
                        tool_calls: [{
                            id: 'call_123',
                            type: 'function',
                            function: {
                                name: 'get_weather',
                                arguments: '{"location": "New York"}'
                            }
                        }]
                    },
                    logprobs: null,
                    finish_reason: 'tool_calls'
                }]
            };

            const result = llm.parseOpenAIChatCompletion(mockResponse, [{ name: 'get_weather' }]);
            expect(result).to.deep.equal({
                content: null,
                toolCalls: [{
                    id: 'call_123',
                    type: 'function',
                    function: {
                        name: 'get_weather',
                        arguments: '{"location": "New York"}'
                    }
                }]
            });
        });

        it('should parse Anthropic chat completion response', () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello! I am Claude, an AI assistant created by Anthropic.'
                }],
                model: 'claude-haiku-4-5-20251001',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 12,
                    output_tokens: 25
                }
            };

            const result = llm.parseAnthropicChatCompletion(mockResponse);
            expect(result).to.equal('Hello! I am Claude, an AI assistant created by Anthropic.');
        });

        it('should parse Ollama chat completion response', () => {
            const mockResponse = {
                response: 'Hello! I am Llama, how can I help you today?',
                done: true
            };

            const result = llm.parseOllamaChatCompletion(mockResponse);
            expect(result).to.equal('Hello! I am Llama, how can I help you today?');
        });

        it('should parse Google chat completion response', () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gemini-2.0-flash',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Hello! I am Gemini, how can I assist you today?',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            const result = llm.parseGoogleChatCompletion(mockResponse);
            expect(result).to.equal('Hello! I am Gemini, how can I assist you today?');
        });

        it('should handle malformed OpenAI response', () => {
            const mockResponse = {
                malformed: 'response'
            };

            const result = llm.parseOpenAIChatCompletion(mockResponse);
            expect(result).to.be.undefined;
        });

        it('should handle malformed Anthropic response', () => {
            const mockResponse = {
                malformed: 'response'
            };

            const result = llm.parseAnthropicChatCompletion(mockResponse);
            expect(result).to.be.undefined;
        });
    });

    describe('Error Parsing', () => {
        it('should parse 401 error with PROVIDER_UNAUTHORIZED code', () => {
            const error = { message: 'Invalid API key' };
            expect(() => llm.parseError(401, error))
                .to.throw(ResilientLLMError, 'Invalid API key')
                .with.property('code', 'PROVIDER_UNAUTHORIZED');
        });

        it('should parse 429 error with PROVIDER_RATE_LIMIT code and retryable', () => {
            const error = { message: 'Rate limit exceeded' };
            try {
                llm.parseError(429, error);
            } catch (e) {
                expect(e).to.be.instanceOf(ResilientLLMError);
                expect(e.code).to.equal('PROVIDER_RATE_LIMIT');
                expect(e.retryable).to.be.true;
                return;
            }
            throw new Error('Expected parseError to throw');
        });

        it('should parse 500 error with metadata containing httpStatus', () => {
            const error = { message: 'Internal server error' };
            try {
                llm.parseError(500, error);
            } catch (e) {
                expect(e).to.be.instanceOf(ResilientLLMError);
                expect(e.code).to.equal('PROVIDER_INTERNAL_ERROR');
                expect(e.metadata?.provider?.httpStatus).to.equal(500);
                return;
            }
            throw new Error('Expected parseError to throw');
        });

        it('should handle unknown error codes', () => {
            const error = { message: 'Unknown error' };
            expect(() => llm.parseError(999, error))
                .to.throw(ResilientLLMError, 'Unknown error')
                .with.property('code', 'PROVIDER_ERROR');
        });

        it('should handle errors without message', () => {
            expect(() => llm.parseError(404, {}))
                .to.throw(ResilientLLMError, 'Not found')
                .with.property('code', 'PROVIDER_NOT_FOUND');
        });
    });

    describe('Token Estimation', () => {
        it('should estimate tokens for simple text', () => {
            const text = 'Hello, world!';
            const tokens = ResilientLLM.estimateTokens(text);
            expect(tokens).to.be.greaterThan(0);
            expect(typeof tokens).to.equal('number');
        });

        it('should estimate tokens for longer text', () => {
            const shortText = 'Hello';
            const longText = 'Hello, this is a much longer text that should have more tokens than the short one.';
            
            const shortTokens = ResilientLLM.estimateTokens(shortText);
            const longTokens = ResilientLLM.estimateTokens(longText);
            
            expect(longTokens).to.be.greaterThan(shortTokens);
        });

        it('should estimate tokens for empty text', () => {
            const tokens = ResilientLLM.estimateTokens('');
            expect(tokens).to.equal(0);
        });

        it('should estimate tokens for special characters', () => {
            const text = '你好世界 🌍 Special chars: !@#$%^&*()';
            const tokens = ResilientLLM.estimateTokens(text);
            expect(tokens).to.be.greaterThan(0);
        });
    });

    describe('Default Models', () => {
        it('should have correct default models', () => {
            const expected = {
                anthropic: "claude-haiku-4-5-20251001",
                openai: "gpt-4o-mini",
                google: "gemini-2.0-flash",
                ollama: "llama3.1:8b"
            };
            
            // Check each model individually to avoid whitespace issues
            const defaultModels = ProviderRegistry.getDefaultModels();
            expect(defaultModels.anthropic.trim()).to.equal(expected.anthropic);
            expect(defaultModels.openai.trim()).to.equal(expected.openai);
            expect(defaultModels.google.trim()).to.equal(expected.google);
            expect(defaultModels.ollama.trim()).to.equal(expected.ollama);
        });
    });

    describe('Constructor and Configuration', () => {
        it('should use default values when no options provided', () => {
            const defaultLLM = new ResilientLLM();
            expect(defaultLLM.aiService).to.equal('anthropic');
            expect(defaultLLM.model).to.equal('claude-haiku-4-5-20251001');
            expect(defaultLLM.temperature).to.equal(undefined);
            expect(defaultLLM.topP).to.equal(undefined);
            expect(defaultLLM.maxInputTokens).to.equal(100000);
            expect(defaultLLM.maxTokens).to.equal(undefined);
        });

        it('should use environment variables when available', () => {
            process.env.PREFERRED_AI_SERVICE = 'openai';
            process.env.PREFERRED_AI_MODEL = 'gpt-4';
            process.env.AI_TEMPERATURE = '0.8';
            process.env.MAX_TOKENS = '4096';

            const envLLM = new ResilientLLM();
            expect(envLLM.aiService).to.equal('openai');
            expect(envLLM.model).to.equal('gpt-4');
            expect(envLLM.temperature).to.equal('0.8');
            expect(envLLM.maxTokens).to.equal('4096');
        });

        it('should override environment variables with options', () => {
            process.env.PREFERRED_AI_SERVICE = 'anthropic';
            process.env.PREFERRED_AI_MODEL = 'claude-haiku-4-5-20251001';

            const customLLM = new ResilientLLM({
                aiService: 'openai',
                model: 'gpt-4o-mini'
            });

            expect(customLLM.aiService).to.equal('openai');
            expect(customLLM.model).to.equal('gpt-4o-mini');
        });

        it('should initialize with custom rate limit config', () => {
            const customConfig = { requestsPerMinute: 30, llmTokensPerMinute: 75000 };
            const customLLM = new ResilientLLM({
                rateLimitConfig: customConfig
            });

            expect(customLLM.rateLimitConfig).to.deep.equal(customConfig);
        });
    });

    describe('Phase 0: Resilience Runtime Correctness', () => {
        it('applies per-request resilience overrides and syncs shared singletons across calls', async () => {
            const capturedConfigs = [];
            RateLimitManager.clear('openai');
            CircuitBreaker.clear('openai');
            sinon.stub(ResilientOperation.prototype, 'execute').callsFake(async function () {
                capturedConfigs.push({
                    retries: this.retries,
                    backoffFactor: this.backoffFactor,
                    timeout: this.timeout,
                    rateLimitConfig: {
                        requestsPerMinute: this.rateLimitManager?.requestBucket?.capacity,
                        llmTokensPerMinute: this.rateLimitManager?.llmTokenBucket?.capacity
                    },
                    circuitBreakerConfig: {
                        failureThreshold: this.circuitBreaker?.failureThreshold,
                        cooldownPeriod: this.circuitBreaker?.cooldownPeriod
                    },
                    maxConcurrent: this.maxConcurrent
                });
                return {
                    data: { choices: [{ message: { content: 'ok' } }] },
                    statusCode: 200
                };
            });

            const overrideLLM = new ResilientLLM({
                aiService: 'openai',
                model: 'gpt-4o-mini',
                retries: 5,
                backoffFactor: 3,
                timeout: 70000,
                rateLimitConfig: { requestsPerMinute: 60, llmTokensPerMinute: 90000 },
                circuitBreakerConfig: { failureThreshold: 5, cooldownPeriod: 30000 }
            });

            // First call: per-request overrides
            await overrideLLM.chat(
                [{ role: 'user', content: 'Hello' }],
                {
                    apiKey: 'test-key',
                    retries: 1,
                    backoffFactor: 1.5,
                    timeout: 5000,
                    rateLimitConfig: { requestsPerMinute: 9, llmTokensPerMinute: 1234 },
                    circuitBreakerConfig: { failureThreshold: 2, cooldownPeriod: 2000 },
                    maxConcurrent: 4
                }
            );

            // Second call: different per-request config on same provider bucket
            await overrideLLM.chat(
                [{ role: 'user', content: 'Hi again' }],
                {
                    apiKey: 'test-key',
                    retries: 7,
                    backoffFactor: 4,
                    timeout: 99000,
                    rateLimitConfig: { requestsPerMinute: 200, llmTokensPerMinute: 50000 },
                    circuitBreakerConfig: { failureThreshold: 10, cooldownPeriod: 60000 },
                    maxConcurrent: 8
                }
            );

            expect(capturedConfigs).to.have.length(2);
            expect(capturedConfigs[0]).to.deep.equal({
                retries: 1,
                backoffFactor: 1.5,
                timeout: 5000,
                rateLimitConfig: { requestsPerMinute: 9, llmTokensPerMinute: 1234 },
                circuitBreakerConfig: { failureThreshold: 2, cooldownPeriod: 2000 },
                maxConcurrent: 4
            });
            expect(capturedConfigs[1]).to.deep.equal({
                retries: 7,
                backoffFactor: 4,
                timeout: 99000,
                rateLimitConfig: { requestsPerMinute: 200, llmTokensPerMinute: 50000 },
                circuitBreakerConfig: { failureThreshold: 10, cooldownPeriod: 60000 },
                maxConcurrent: 8
            });
        });

        it('uses provider-specific bucket scope when aiService is switched per request', async () => {
            const capturedBucketIds = [];
            RateLimitManager.clear('anthropic');
            CircuitBreaker.clear('anthropic');
            sinon.stub(ResilientOperation.prototype, 'execute').callsFake(async function () {
                capturedBucketIds.push(this.bucketId);
                return {
                    data: { content: [{ text: 'ok' }] },
                    statusCode: 200
                };
            });

            const providerScopedLLM = new ResilientLLM({
                aiService: 'openai',
                model: 'gpt-4o-mini'
            });

            await providerScopedLLM.chat(
                [{ role: 'user', content: 'Hello' }],
                {
                    aiService: 'anthropic',
                    model: 'claude-haiku-4-5-20251001',
                    apiKey: 'test-key'
                }
            );

            expect(capturedBucketIds).to.deep.equal(['anthropic']);
        });

        it('falls back to constructor defaults when per-request resilience options are missing', async () => {
            const capturedConfigs = [];
            RateLimitManager.clear('openai');
            CircuitBreaker.clear('openai');
            sinon.stub(ResilientOperation.prototype, 'execute').callsFake(async function () {
                capturedConfigs.push({
                    retries: this.retries,
                    backoffFactor: this.backoffFactor,
                    timeout: this.timeout,
                    rateLimitConfig: {
                        requestsPerMinute: this.rateLimitManager?.requestBucket?.capacity,
                        llmTokensPerMinute: this.rateLimitManager?.llmTokenBucket?.capacity
                    },
                    circuitBreakerConfig: {
                        failureThreshold: this.circuitBreaker?.failureThreshold,
                        cooldownPeriod: this.circuitBreaker?.cooldownPeriod
                    },
                    maxConcurrent: this.maxConcurrent
                });
                return {
                    data: { choices: [{ message: { content: 'ok' } }] },
                    statusCode: 200
                };
            });

            const defaultedLLM = new ResilientLLM({
                aiService: 'openai',
                model: 'gpt-4o-mini',
                retries: 6,
                backoffFactor: 2.5,
                timeout: 42000,
                rateLimitConfig: { requestsPerMinute: 77, llmTokensPerMinute: 88000 },
                circuitBreakerConfig: { failureThreshold: 7, cooldownPeriod: 45000 },
                maxConcurrent: 3
            });

            await defaultedLLM.chat(
                [{ role: 'user', content: 'Hello' }],
                { apiKey: 'test-key' }
            );

            expect(capturedConfigs).to.have.length(1);
            expect(capturedConfigs[0]).to.deep.equal({
                retries: 6,
                backoffFactor: 2.5,
                timeout: 42000,
                rateLimitConfig: { requestsPerMinute: 77, llmTokensPerMinute: 88000 },
                circuitBreakerConfig: { failureThreshold: 7, cooldownPeriod: 45000 },
                maxConcurrent: 3
            });
        });
    });
}); 