import ResilientLLM from '../ResilientLLM.js';

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

    describe('URL and API Key Generation', () => {
        test('should generate correct API URL for OpenAI', () => {
            const url = llm.getApiUrl('openai');
            expect(url).toBe('https://api.openai.com/v1/chat/completions');
        });

        test('should generate correct API URL for Anthropic', () => {
            const url = llm.getApiUrl('anthropic');
            expect(url).toBe('https://api.anthropic.com/v1/messages');
        });

        test('should generate correct API URL for Gemini', () => {
            const url = llm.getApiUrl('gemini');
            expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
        });

        test('should generate correct API URL for Ollama with default URL', () => {
            const url = llm.getApiUrl('ollama');
            expect(url).toBe('http://localhost:11434/api/generate');
        });

        test('should generate correct API URL for Ollama with custom URL', () => {
            process.env.OLLAMA_API_URL = 'http://custom-ollama:8080/api/generate';
            const url = llm.getApiUrl('ollama');
            expect(url).toBe('http://custom-ollama:8080/api/generate');
        });

        test('should throw error for invalid AI service', () => {
            expect(() => llm.getApiUrl('invalid-service')).toThrow('Invalid AI service specified');
        });

        test('should get API key from environment variables', () => {
            process.env.OPENAI_API_KEY = 'test-openai-key';
            const apiKey = llm.getApiKey('openai');
            expect(apiKey).toBe('test-openai-key');
        });

        test('should throw error for invalid AI service when getting API key', () => {
            expect(() => llm.getApiKey('invalid-service')).toThrow('Invalid AI service specified');
        });
    });

    describe('Message Formatting', () => {
        test('should format messages for Anthropic correctly', () => {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' },
                { role: 'user', content: 'How are you?' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).toBe('You are a helpful assistant.');
            expect(formattedMessages).toHaveLength(3);
            expect(formattedMessages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(formattedMessages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
            expect(formattedMessages[2]).toEqual({ role: 'user', content: 'How are you?' });
        });

        test('should handle messages without system message', () => {
            const messages = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there!' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).toBeUndefined();
            expect(formattedMessages).toHaveLength(2);
            expect(formattedMessages).toEqual(messages);
        });

        test('should handle empty messages array', () => {
            const messages = [];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).toBeUndefined();
            expect(formattedMessages).toHaveLength(0);
        });

        test('should handle multiple system messages (use last one)', () => {
            const messages = [
                { role: 'system', content: 'First system message' },
                { role: 'user', content: 'Hello' },
                { role: 'system', content: 'Second system message' },  // ← This should win
                { role: 'assistant', content: 'Hi there!' }
            ];

            const { system, messages: formattedMessages } = llm.formatMessageForAnthropic(messages);
            
            expect(system).toBe('Second system message');  // ← Fixed expectation
            expect(formattedMessages).toHaveLength(2);
            expect(formattedMessages[0]).toEqual({ role: 'user', content: 'Hello' });
            expect(formattedMessages[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
        });
    });

    describe('Response Parsing', () => {
        test('should parse OpenAI chat completion response', () => {
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
            expect(result).toBe('Hello! How can I help you today?');
        });

        test('should parse OpenAI chat completion response with tool calls', () => {
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
            expect(result).toEqual({
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

        test('should parse Anthropic chat completion response', () => {
            const mockResponse = {
                id: 'msg_123',
                type: 'message',
                role: 'assistant',
                content: [{
                    type: 'text',
                    text: 'Hello! I am Claude, an AI assistant created by Anthropic.'
                }],
                model: 'claude-3-5-sonnet-20240620',
                stop_reason: 'end_turn',
                usage: {
                    input_tokens: 12,
                    output_tokens: 25
                }
            };

            const result = llm.parseAnthropicChatCompletion(mockResponse);
            expect(result).toBe('Hello! I am Claude, an AI assistant created by Anthropic.');
        });

        test('should parse Ollama chat completion response', () => {
            const mockResponse = {
                response: 'Hello! I am Llama, how can I help you today?',
                done: true
            };

            const result = llm.parseOllamaChatCompletion(mockResponse);
            expect(result).toBe('Hello! I am Llama, how can I help you today?');
        });

        test('should parse Gemini chat completion response', () => {
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

            const result = llm.parseGeminiChatCompletion(mockResponse);
            expect(result).toBe('Hello! I am Gemini, how can I assist you today?');
        });

        test('should handle malformed OpenAI response', () => {
            const mockResponse = {
                malformed: 'response'
            };

            const result = llm.parseOpenAIChatCompletion(mockResponse);
            expect(result).toBeUndefined();
        });

        test('should handle malformed Anthropic response', () => {
            const mockResponse = {
                malformed: 'response'
            };

            const result = llm.parseAnthropicChatCompletion(mockResponse);
            expect(result).toBeUndefined();
        });
    });

    describe('Error Parsing', () => {
        test('should parse 401 error correctly', () => {
            const error = { message: 'Invalid API key' };
            expect(() => llm.parseError(401, error)).toThrow('Invalid API key');
        });

        test('should parse 429 error correctly', () => {
            const error = { message: 'Rate limit exceeded' };
            expect(() => llm.parseError(429, error)).toThrow('Rate limit exceeded');
        });

        test('should parse 500 error correctly', () => {
            const error = { message: 'Internal server error' };
            expect(() => llm.parseError(500, error)).toThrow('Internal server error');
        });

        test('should handle unknown error codes', () => {
            const error = { message: 'Unknown error' };
            expect(() => llm.parseError(999, error)).toThrow('Unknown error');
        });

        test('should handle errors without message', () => {
            expect(() => llm.parseError(404, {})).toThrow('Not found');
        });
    });

    describe('Token Estimation', () => {
        test('should estimate tokens for simple text', () => {
            const text = 'Hello, world!';
            const tokens = ResilientLLM.estimateTokens(text);
            expect(tokens).toBeGreaterThan(0);
            expect(typeof tokens).toBe('number');
        });

        test('should estimate tokens for longer text', () => {
            const shortText = 'Hello';
            const longText = 'Hello, this is a much longer text that should have more tokens than the short one.';
            
            const shortTokens = ResilientLLM.estimateTokens(shortText);
            const longTokens = ResilientLLM.estimateTokens(longText);
            
            expect(longTokens).toBeGreaterThan(shortTokens);
        });

        test('should estimate tokens for empty text', () => {
            const tokens = ResilientLLM.estimateTokens('');
            expect(tokens).toBe(0);
        });

        test('should estimate tokens for special characters', () => {
            const text = '你好世界 🌍 Special chars: !@#$%^&*()';
            const tokens = ResilientLLM.estimateTokens(text);
            expect(tokens).toBeGreaterThan(0);
        });
    });

    describe('Default Models', () => {
        test('should have correct default models', () => {
            expect(ResilientLLM.DEFAULT_MODELS).toEqual({
                anthropic: "claude-3-5-sonnet-20240620",
                openai: "gpt-4o-mini",
                gemini: "gemini-2.0-flash",
                ollama: "llama3.1:8b"
            });
        });
    });

    describe('Constructor and Configuration', () => {
        test('should use default values when no options provided', () => {
            const defaultLLM = new ResilientLLM();
            expect(defaultLLM.aiService).toBe('anthropic');
            expect(defaultLLM.model).toBe('claude-3-5-sonnet-20240620');
            expect(defaultLLM.temperature).toBe(0);
            expect(defaultLLM.maxTokens).toBe(2048);
        });

        test('should use environment variables when available', () => {
            process.env.PREFERRED_AI_SERVICE = 'openai';
            process.env.PREFERRED_AI_MODEL = 'gpt-4';
            process.env.AI_TEMPERATURE = '0.8';
            process.env.MAX_TOKENS = '4096';

            const envLLM = new ResilientLLM();
            expect(envLLM.aiService).toBe('openai');
            expect(envLLM.model).toBe('gpt-4');
            expect(envLLM.temperature).toBe('0.8');
            expect(envLLM.maxTokens).toBe('4096');
        });

        test('should override environment variables with options', () => {
            process.env.PREFERRED_AI_SERVICE = 'anthropic';
            process.env.PREFERRED_AI_MODEL = 'claude-3-5-sonnet-20240620';

            const customLLM = new ResilientLLM({
                aiService: 'openai',
                model: 'gpt-4o-mini'
            });

            expect(customLLM.aiService).toBe('openai');
            expect(customLLM.model).toBe('gpt-4o-mini');
        });

        test('should initialize with custom rate limit config', () => {
            const customConfig = { requestsPerMinute: 30, llmTokensPerMinute: 75000 };
            const customLLM = new ResilientLLM({
                rateLimitConfig: customConfig
            });

            expect(customLLM.rateLimitConfig).toEqual(customConfig);
        });
    });
}); 