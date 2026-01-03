import { ResilientLLM } from '../index.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

// Configure chai to handle promises
use(chaiAsPromised);

// Mock environment variables for testing
const originalEnv = process.env;

beforeEach(() => {
    process.env = {
        ...originalEnv,
        OPENAI_API_KEY: 'test-openai-key',
        ANTHROPIC_API_KEY: 'test-anthropic-key',
        GEMINI_API_KEY: 'test-gemini-key',
        OLLAMA_API_KEY: 'test-ollama-key',
        OLLAMA_API_URL: 'http://localhost:11434/api/generate'
    };
});

afterEach(() => {
    process.env = originalEnv;
    sinon.restore();
});

describe('ResilientLLM Chat Function E2E Tests with mocked fetch', () => {
    let llm;
    let mockFetch;

    beforeEach(() => {
        mockFetch = sinon.stub();
        global.fetch = mockFetch;
        llm = new ResilientLLM({
            aiService: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 2048,
            timeout: 30000,
            rateLimitConfig: { requestsPerMinute: 60, llmTokensPerMinute: 150000 }
        });
    });

    describe('Basic Chat Functionality', () => {
        it('should successfully chat with OpenAI service', async () => {
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

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await llm.chat(conversationHistory);
            
            sinon.assert.calledWith(
                mockFetch,
                'https://api.openai.com/v1/chat/completions',
                sinon.match({
                    method: 'POST',
                    headers: sinon.match({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-openai-key'
                    }),
                    body: sinon.match(/.*"model":"gpt-4o-mini".*/)
                })
            );
            sinon.assert.calledOnce(mockFetch);
            expect(response).to.exist;
            expect(response).to.equal('Hello! How can I help you today?');
        });

        it('should successfully chat with Anthropic service', async () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello! I am Claude, an AI assistant created by Anthropic. How can I help you today?'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                    input_tokens: 12,
                    output_tokens: 25
                }
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const anthropicLLM = new ResilientLLM({
                aiService: 'anthropic',
                model: 'claude-3-5-sonnet-20240620'
            });

            const conversationHistory = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await anthropicLLM.chat(conversationHistory);
            
            expect(response).to.equal('Hello! I am Claude, an AI assistant created by Anthropic. How can I help you today?');
            sinon.assert.calledWith(
                mockFetch,
                'https://api.anthropic.com/v1/messages',
                sinon.match({
                    method: 'POST',
                    headers: sinon.match({
                        'Content-Type': 'application/json',
                        'x-api-key': 'test-anthropic-key',
                        'anthropic-version': '2023-06-01'
                    }),
                    body: sinon.match(/.*"system":"You are a helpful assistant.".+/)
                })
            );
        });

        it('should successfully chat with Google service', async () => {
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

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const googleLLM = new ResilientLLM({
                aiService: 'google',
                model: 'gemini-2.0-flash'
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await googleLLM.chat(conversationHistory);
            
            expect(response).to.equal('Hello! I am Gemini, how can I assist you today?');
            sinon.assert.calledWith(
                mockFetch,
                'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                sinon.match({
                    method: 'POST',
                    headers: sinon.match({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-gemini-key'
                    })
                })
            );
        });

        it('should successfully chat with Ollama service', async () => {
            const mockResponse = {
                response: 'Hello! I am Llama, how can I help you today?',
                done: true
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const ollamaLLM = new ResilientLLM({
                aiService: 'ollama',
                model: 'openai'
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await ollamaLLM.chat(conversationHistory);
            
            expect(response).to.equal('Hello! I am Llama, how can I help you today?');
            sinon.assert.calledWith(
                mockFetch,
                'http://localhost:11434/api/generate',
                sinon.match({
                    method: 'POST',
                    headers: sinon.match({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-ollama-key'
                    })
                })
            );
        });
    });

    describe('Tool Calling Support', () => {
        it('should handle tool calls with OpenAI', async () => {
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
                }],
                usage: {
                    prompt_tokens: 50,
                    completion_tokens: 20,
                    total_tokens: 70
                }
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'What is the weather like in New York?' }
            ];

            const tools = [{
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get the current weather in a given location',
                    parameters: {
                        type: 'object',
                        properties: {
                            location: {
                                type: 'string',
                                description: 'The city and state, e.g. San Francisco, CA'
                            }
                        },
                        required: ['location']
                    }
                }
            }];

            const response = await llm.chat(conversationHistory, { tools });
            
            expect(response).to.deep.equal({
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

        it('should convert tool schema for Anthropic', async () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'I can help you get the weather information for New York.'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 50,
                    output_tokens: 15
                }
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const anthropicLLM = new ResilientLLM({
                aiService: 'anthropic',
                model: 'claude-3-5-sonnet-20240620'
            });

            const conversationHistory = [
                { role: 'user', content: 'What is the weather like in New York?' }
            ];

            const tools = [{
                type: 'function',
                function: {
                    name: 'get_weather',
                    description: 'Get the current weather in a given location',
                    parameters: {
                        type: 'object',
                        properties: {
                            location: {
                                type: 'string',
                                description: 'The city and state, e.g. San Francisco, CA'
                            }
                        },
                        required: ['location']
                    }
                }
            }];

            const response = await anthropicLLM.chat(conversationHistory, { tools });
            
            expect(response).to.equal('I can help you get the weather information for New York.');
            
            // Verify that the request body contains the converted tool schema
            const requestBody = JSON.parse(mockFetch.getCall(0).args[1].body);
            expect(requestBody.tools[0].function.input_schema).to.exist;
            expect(requestBody.tools[0].function.parameters).to.be.undefined;
        });
    });

    describe('Error Handling', () => {
        it('should handle 401 authentication errors', async () => {
            const mockErrorResponse = {
                error: {
                    message: 'Invalid API key',
                    type: 'invalid_request_error',
                    param: null,
                    code: 'invalid_api_key'
                }
            };

            mockFetch.resolves({
                ok: false,
                status: 401,
                json: async () => mockErrorResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).to.be.rejectedWith('Invalid API key');
        });

        it('should handle 429 rate limit errors and retry with alternate service', async () => {
            const mockRateLimitResponse = {
                error: {
                    message: 'Rate limit exceeded',
                    type: 'rate_limit_error',
                    param: null,
                    code: 'rate_limit_exceeded'
                }
            };

            const mockAnthropicResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello from Anthropic fallback!'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 12,
                    output_tokens: 8
                }
            };

            // First call to OpenAI fails with rate limit
            mockFetch.onFirstCall().resolves({
                ok: false,
                status: 429,
                json: async () => mockRateLimitResponse
            });

            // Second call to Anthropic succeeds
            mockFetch.onSecondCall().resolves({
                ok: true,
                status: 200,
                json: async () => mockAnthropicResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).to.equal('Hello from Anthropic fallback!');
            sinon.assert.calledTwice(mockFetch);
            
            // Verify first call was to OpenAI
            expect(mockFetch.getCall(0).args[0]).to.equal('https://api.openai.com/v1/chat/completions');
            
            // Verify second call was to Anthropic
            expect(mockFetch.getCall(1).args[0]).to.equal('https://api.anthropic.com/v1/messages');
        });

        it('should handle token limit exceeded', async () => {
            const longText = 'a'.repeat(404040); // Very long text to exceed token limit
            const conversationHistory = [
                { role: 'user', content: longText }
            ];

            await expect(llm.chat(conversationHistory)).to.be.rejectedWith('Input tokens exceed the maximum limit');
        });

        it('should handle invalid AI service', async () => {
            const invalidLLM = new ResilientLLM({
                aiService: 'invalid-service'
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(invalidLLM.chat(conversationHistory)).to.be.rejectedWith('Invalid provider specified');
        });

        it('should handle missing API key', async () => {
            process.env.OPENAI_API_KEY = '';
            
            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];
            await expect(llm.chat(conversationHistory)).to.be.rejected;
        });
    });

    describe('LLM Options and Configuration', () => {
        it('should handle custom temperature and max tokens', async () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Response with custom parameters',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const customOptions = {
                temperature: 1.0,
                maxTokens: 4000,
                topP: 0.8
            };

            const response = await llm.chat(conversationHistory, customOptions);
            
            expect(response).to.equal('Response with custom parameters');
            
            const requestBody = JSON.parse(mockFetch.getCall(0).args[1].body);
            expect(requestBody.temperature).to.equal(1.0);
            expect(requestBody.max_tokens).to.equal(4000);
            expect(requestBody.top_p).to.equal(0.8);
        });

        it('should handle reasoning models (o1) with different parameters', async () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'o1-preview',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Reasoning model response',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Solve this complex problem' }
            ];

            const reasoningOptions = {
                model: 'o1-preview',
                maxCompletionTokens: 8000,
                reasoningEffort: 'high'
            };

            const response = await llm.chat(conversationHistory, reasoningOptions);
            
            expect(response).to.equal('Reasoning model response');
            
            const requestBody = JSON.parse(mockFetch.getCall(0).args[1].body);
            expect(requestBody.max_completion_tokens).to.equal(8000);
            expect(requestBody.reasoning_effort).to.equal('high');
            expect(requestBody.temperature).to.be.undefined; // Should not be set for reasoning models
        });

        it('should handle response format specification', async () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: '{"answer": "42"}',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'What is the answer to life, the universe, and everything? Respond in JSON format.' }
            ];

            const jsonOptions = {
                responseFormat: { type: 'json_object' }
            };

            const response = await llm.chat(conversationHistory, jsonOptions);
            
            expect(response).to.equal('{"answer": "42"}');
            
            const requestBody = JSON.parse(mockFetch.getCall(0).args[1].body);
            expect(requestBody.response_format).to.deep.equal({ type: 'json_object' });
        });

        it('should override service and model in options', async () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Response from overridden service'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 12,
                    output_tokens: 8
                }
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const overrideOptions = {
                aiService: 'anthropic',
                model: 'claude-3-5-sonnet-20240620'
            };

            const response = await llm.chat(conversationHistory, overrideOptions);
            
            expect(response).to.equal('Response from overridden service');
            sinon.assert.calledWith(
                mockFetch,
                'https://api.anthropic.com/v1/messages',
                sinon.match({
                    method: 'POST',
                    headers: sinon.match({
                        'x-api-key': 'test-anthropic-key'
                    })
                })
            );
        });
    });

    describe('Rate Limiting and Resilience', () => {
        it('should handle rate limiting with token bucket', async () => {
            const rateLimitedLLM = new ResilientLLM({
                aiService: 'openai',
                rateLimitConfig: { requestsPerMinute: 1, llmTokensPerMinute: 1000 }
            });

            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'Response 1',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            // First request should succeed
            const response1 = await rateLimitedLLM.chat(conversationHistory);
            expect(response1).to.equal('Response 1');

            // Second request should also succeed but might be rate limited
            const response2 = await rateLimitedLLM.chat(conversationHistory);
            expect(response2).to.equal('Response 1');
        });

        it('should handle timeout scenarios', async () => {
            const timeoutLLM = new ResilientLLM({
                aiService: 'openai',
                timeout: 1000 // 1 second timeout
            });

            // Mock a delayed response
            mockFetch.callsFake(() => 
                new Promise((resolve) => {
                    setTimeout(() => resolve({
                        ok: true,
                        status: 200,
                        json: async () => ({ choices: [{ message: { content: 'Late response' } }] })
                    }), 2000); // 2 second delay
                })
            );

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];
            await expect(timeoutLLM.chat(conversationHistory)).to.be.rejectedWith('Operation timed out');
        });
    });

    describe('Conversation History Formatting', () => {
        it('should format system messages correctly for Anthropic', async () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello, I understand my role as a helpful assistant.'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 30,
                    output_tokens: 12
                }
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const anthropicLLM = new ResilientLLM({
                aiService: 'anthropic',
                model: 'claude-3-5-sonnet-20240620'
            });

            const conversationHistory = [
                { role: 'system', content: 'You are a helpful assistant specialized in programming.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there! How can I help you with programming?' },
                { role: 'user', content: 'What is JavaScript?' }
            ];

            const response = await anthropicLLM.chat(conversationHistory);
            
            expect(response).to.equal('Hello, I understand my role as a helpful assistant.');
            
            const requestBody = JSON.parse(mockFetch.getCall(0).args[1].body);
            expect(requestBody.system).to.equal('You are a helpful assistant specialized in programming.');
            expect(requestBody.messages).to.have.length(3); // System message should be removed from messages array
            expect(requestBody.messages[0].role).to.equal('user');
        });

        it('should handle empty conversation history', async () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'How can I help you?',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const response = await llm.chat([]);
            
            expect(response).to.equal('How can I help you?');
        });
    });

    describe('Fallback and Retry Logic', () => {
        it('should exhaust all services before failing', async () => {
            const mockErrorResponse = {
                error: {
                    message: 'Service unavailable',
                    type: 'service_unavailable',
                    code: 'service_unavailable'
                }
            };

            // Mock all services to return 429 (rate limited)
            mockFetch.resolves({
                ok: false,
                status: 429,
                json: async () => mockErrorResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).to.be.rejectedWith('No alternative model found');
            
            // Should try multiple services (OpenAI, then Anthropic, then Google, then Ollama)
            sinon.assert.callCount(mockFetch, 4);
        }).timeout(35000);

        it('should succeed with second service when first fails', async () => {
            const mockErrorResponse = {
                error: {
                    message: 'Service unavailable',
                    type: 'service_unavailable',
                    code: 'service_unavailable'
                }
            };

            const mockSuccessResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello from backup service!'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 12,
                    output_tokens: 8
                }
            };

            // First call fails
            mockFetch.onFirstCall().resolves({
                ok: false,
                status: 429,
                json: async () => mockErrorResponse
            });

            // Second call succeeds
            mockFetch.onSecondCall().resolves({
                ok: true,
                status: 200,
                json: async () => mockSuccessResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).to.equal('Hello from backup service!');
            sinon.assert.calledTwice(mockFetch);
        });
    }).timeout(35000);

    describe('Edge Cases and Special Scenarios', () => {
        it('should handle malformed API responses gracefully', async () => {
            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => ({ malformed: 'response' })
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).to.be.null; // Should handle gracefully
        });

        it('should handle network errors', async () => {
            mockFetch.rejects(new Error('Network error'));

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).to.be.rejectedWith('Network error');
        });

        it('should handle very long conversation histories', async () => {
            const longConversationHistory = [];
            for (let i = 0; i < 10000; i++) {
                longConversationHistory.push({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}: This is a test message to create a long conversation history.`
                });
            }
            await expect(llm.chat(longConversationHistory)).to.be.rejectedWith('Input tokens exceed the maximum limit');
        });

        it('should handle special characters in conversation', async () => {
            const mockResponse = {
                id: 'chatcmpl-123',
                object: 'chat.completion',
                created: 1728933352,
                model: 'gpt-4o-mini',
                choices: [{
                    index: 0,
                    message: {
                        role: 'assistant',
                        content: 'I can handle special characters: 你好, здравствуй, 🚀',
                        refusal: null
                    },
                    logprobs: null,
                    finish_reason: 'stop'
                }]
            };
            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });
            const conversationHistory = [
                { role: 'user', content: 'Hello in different languages: 你好, здравствуй, 🚀' }
            ];
            const response = await llm.chat(conversationHistory);            
            expect(response).to.equal('I can handle special characters: 你好, здравствуй, 🚀');
        });
    });
}).timeout(20000);

describe('ResilientLLM Chat Function E2E Tests with real fetch', () => {
    let llm;
    beforeEach(() => {
        llm = new ResilientLLM({
            aiService: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 2048,
            timeout: 30000,
            rateLimitConfig: { requestsPerMinute: 60, llmTokensPerMinute: 150000 }
        });
    });

    it('should abort the operation when abort is called', async () => {
        const conversationHistory = [{ role: 'user', content: 'Hello' }];
        const chatPromise = llm.chat(conversationHistory);
        // Wait for 10ms to ensure the request has started
        try {
        await new Promise(resolve => setTimeout(resolve, 10));
        llm.abort();
        } catch (error) {
            expect(error.name).to.equal('AbortError');
        }
    }).timeout(20000);
}); 