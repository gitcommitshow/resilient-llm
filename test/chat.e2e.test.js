import ResilientLLM from '../ResilientLLM.js';
import {jest, describe, expect, test, beforeEach, afterEach} from '@jest/globals';

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
    jest.clearAllMocks();
});

describe('ResilientLLM Chat Function E2E Tests', () => {
    let llm;
    let mockFetch;

    beforeEach(() => {
        mockFetch = jest.fn();
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
        test('should successfully chat with OpenAI service', async () => {
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

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-openai-key'
                    }),
                    body: expect.stringContaining('"model":"gpt-4o-mini"')
                })
            );
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(response).toBeDefined();
            expect(response).toBe('Hello! How can I help you today?');
        });

        test('should successfully chat with Anthropic service', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Hello! I am Claude, an AI assistant created by Anthropic. How can I help you today?');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.anthropic.com/v1/messages',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'x-api-key': 'test-anthropic-key',
                        'anthropic-version': '2023-06-01'
                    }),
                    body: expect.stringContaining('"system":"You are a helpful assistant."')
                })
            );
        });

        test('should successfully chat with Gemini service', async () => {
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

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const geminiLLM = new ResilientLLM({
                aiService: 'gemini',
                model: 'gemini-2.0-flash'
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello, how are you?' }
            ];

            const response = await geminiLLM.chat(conversationHistory);
            
            expect(response).toBe('Hello! I am Gemini, how can I assist you today?');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-gemini-key'
                    })
                })
            );
        });

        test('should successfully chat with Ollama service', async () => {
            const mockResponse = {
                response: 'Hello! I am Llama, how can I help you today?',
                done: true
            };

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Hello! I am Llama, how can I help you today?');
            expect(mockFetch).toHaveBeenCalledWith(
                'http://localhost:11434/api/generate',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer test-ollama-key'
                    })
                })
            );
        });
    });

    describe('Tool Calling Support', () => {
        test('should handle tool calls with OpenAI', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toEqual({
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

        test('should convert tool schema for Anthropic', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('I can help you get the weather information for New York.');
            
            // Verify that the request body contains the converted tool schema
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.tools[0].function.input_schema).toBeDefined();
            expect(requestBody.tools[0].function.parameters).toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle 401 authentication errors', async () => {
            const mockErrorResponse = {
                error: {
                    message: 'Invalid API key',
                    type: 'invalid_request_error',
                    param: null,
                    code: 'invalid_api_key'
                }
            };

            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => mockErrorResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).rejects.toThrow('Invalid API key');
        });

        test('should handle 429 rate limit errors and retry with alternate service', async () => {
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
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => mockRateLimitResponse
            });

            // Second call to Anthropic succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockAnthropicResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).toBe('Hello from Anthropic fallback!');
            expect(mockFetch).toHaveBeenCalledTimes(2);
            
            // Verify first call was to OpenAI
            expect(mockFetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
            
            // Verify second call was to Anthropic
            expect(mockFetch.mock.calls[1][0]).toBe('https://api.anthropic.com/v1/messages');
        });

        test('should handle token limit exceeded', async () => {
            const longText = 'a'.repeat(404040); // Very long text to exceed token limit
            const conversationHistory = [
                { role: 'user', content: longText }
            ];

            await expect(llm.chat(conversationHistory)).rejects.toThrow('Input tokens exceed the maximum limit');
        });

        test('should handle invalid AI service', async () => {
            const invalidLLM = new ResilientLLM({
                aiService: 'invalid-service'
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(invalidLLM.chat(conversationHistory)).rejects.toThrow('Invalid AI service specified');
        });

        test('should handle missing API key', async () => {
            process.env.OPENAI_API_KEY = '';
            
            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];
            await expect(llm.chat(conversationHistory)).rejects.toThrow();
        });
    });

    describe('LLM Options and Configuration', () => {
        test('should handle custom temperature and max tokens', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Response with custom parameters');
            
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.temperature).toBe(1.0);
            expect(requestBody.max_tokens).toBe(4000);
            expect(requestBody.top_p).toBe(0.8);
        });

        test('should handle reasoning models (o1) with different parameters', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Reasoning model response');
            
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.max_completion_tokens).toBe(8000);
            expect(requestBody.reasoning_effort).toBe('high');
            expect(requestBody.temperature).toBeUndefined(); // Should not be set for reasoning models
        });

        test('should handle response format specification', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('{"answer": "42"}');
            
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.response_format).toEqual({ type: 'json_object' });
        });

        test('should override service and model in options', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Response from overridden service');
            expect(mockFetch).toHaveBeenCalledWith(
                'https://api.anthropic.com/v1/messages',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'x-api-key': 'test-anthropic-key'
                    })
                })
            );
        });
    });

    describe('Rate Limiting and Resilience', () => {
        test('should handle rate limiting with token bucket', async () => {
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

            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            // First request should succeed
            const response1 = await rateLimitedLLM.chat(conversationHistory);
            expect(response1).toBe('Response 1');

            // Second request should also succeed but might be rate limited
            const response2 = await rateLimitedLLM.chat(conversationHistory);
            expect(response2).toBe('Response 1');
        });

        test('should handle timeout scenarios', async () => {
            const timeoutLLM = new ResilientLLM({
                aiService: 'openai',
                timeout: 1000 // 1 second timeout
            });

            // Mock a delayed response
            mockFetch.mockImplementationOnce(() => 
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
            await expect(timeoutLLM.chat(conversationHistory)).rejects.toThrow('Operation timed out');
        });
    });

    describe('Conversation History Formatting', () => {
        test('should format system messages correctly for Anthropic', async () => {
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

            mockFetch.mockResolvedValueOnce({
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
            
            expect(response).toBe('Hello, I understand my role as a helpful assistant.');
            
            const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
            expect(requestBody.system).toBe('You are a helpful assistant specialized in programming.');
            expect(requestBody.messages).toHaveLength(3); // System message should be removed from messages array
            expect(requestBody.messages[0].role).toBe('user');
        });

        test('should handle empty conversation history', async () => {
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

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const response = await llm.chat([]);
            
            expect(response).toBe('How can I help you?');
        });
    });

    describe('Fallback and Retry Logic', () => {
        test('should exhaust all services before failing', async () => {
            const mockErrorResponse = {
                error: {
                    message: 'Service unavailable',
                    type: 'service_unavailable',
                    code: 'service_unavailable'
                }
            };

            // Mock all services to return 429 (rate limited)
            mockFetch.mockResolvedValue({
                ok: false,
                status: 429,
                json: async () => mockErrorResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).rejects.toThrow('No alternative model found');
            
            // Should try multiple services (OpenAI, then Anthropic, then Gemini, then Ollama)
            expect(mockFetch).toHaveBeenCalledTimes(4);
        });

        test('should succeed with second service when first fails', async () => {
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
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => mockErrorResponse
            });

            // Second call succeeds
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockSuccessResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).toBe('Hello from backup service!');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });
    });

    describe('Edge Cases and Special Scenarios', () => {
        test('should handle malformed API responses gracefully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ malformed: 'response' })
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).toBeUndefined(); // Should handle gracefully
        });

        test('should handle network errors', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const conversationHistory = [
                { role: 'user', content: 'Hello' }
            ];

            await expect(llm.chat(conversationHistory)).rejects.toThrow('Network error');
        });

        test('should handle very long conversation histories', async () => {
            const longConversationHistory = [];
            for (let i = 0; i < 10000; i++) {
                longConversationHistory.push({
                    role: i % 2 === 0 ? 'user' : 'assistant',
                    content: `Message ${i}: This is a test message to create a long conversation history.`
                });
            }
            await expect(llm.chat(longConversationHistory)).rejects.toThrow('Input tokens exceed the maximum limit');
        });

        test('should handle special characters in conversation', async () => {
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

            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const conversationHistory = [
                { role: 'user', content: 'Hello in different languages: 你好, здравствуй, 🚀' }
            ];

            const response = await llm.chat(conversationHistory);
            
            expect(response).toBe('I can handle special characters: 你好, здравствуй, 🚀');
        });
    });
}); 