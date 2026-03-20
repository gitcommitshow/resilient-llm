import { ResilientLLM } from '../dist/index.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

// Configure chai to handle promises
use(chaiAsPromised);

// Preserve environment for real-fetch tests
const originalEnv = process.env;

afterEach(() => {
    process.env = originalEnv;
});

describe('ResilientLLM operations tests in real world, with real fetch', () => {
    let llm;
    beforeEach(() => {
        process.env = { ...originalEnv };
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

    describe('Structured output test with real fetch', () => {
        it('should return valid JSON when using json_object response format (real fetch)', async () => {
            const conversationHistory = [
                {
                    role: 'user',
                    content: 'Return a small JSON object with fields "answer" (string) and "questionId" (number).'
                }
            ];

            const result = await llm.chat(conversationHistory, {
                responseFormat: { type: 'json_object' }
            });

            expect(result.content).to.be.an('object');
            expect(result.content).to.have.property('answer');
            expect(result.content).to.have.property('questionId');
        }).timeout(30000);

        // Shared schema for OpenAI (response_format) and Anthropic (output_config) json_schema e2e checks.
        const mathAnswerJsonSchemaFormat = {
            type: 'json_schema',
            json_schema: {
                name: 'math_answer',
                schema: {
                    type: 'object',
                    properties: {
                        sum: { type: 'number' },
                        explanationSteps: {
                            type: 'array',
                            items: { type: 'string' }
                        }
                    },
                    required: ['sum', 'explanationSteps'],
                    // Anthropic Messages structured output requires explicit false here for object roots.
                    additionalProperties: false
                }
            }
        };

        const mathAnswerConversation = [
            {
                role: 'user',
                content: 'Add 2 and 3 and respond ONLY with JSON matching the schema where "sum" is the numeric result and "explanationSteps" is an array of short strings.'
            }
        ];

        it('should respect a more complex json_schema response format with OpenAI (real fetch)', async () => {
            const result = await llm.chat(mathAnswerConversation, {
                responseFormat: mathAnswerJsonSchemaFormat
            });

            expect(result.content).to.be.an('object');
            expect(result.content).to.have.property('sum');
            expect(result.content.sum).to.be.a('number');
            expect(result.content).to.have.property('explanationSteps');
            expect(result.content.explanationSteps).to.be.an('array');
            result.content.explanationSteps.forEach(step => expect(step).to.be.a('string'));
        }).timeout(30000);

        // Same structured-output contract as OpenAI, via Anthropic Messages API (output_config.format).
        it('should respect a more complex json_schema response format with Anthropic (real fetch)', async () => {
            const anthropicLlm = new ResilientLLM({
                aiService: 'anthropic',
                model: 'claude-haiku-4-5-20251001',
                temperature: 0.7,
                maxTokens: 2048,
                timeout: 30000,
                rateLimitConfig: { requestsPerMinute: 60, llmTokensPerMinute: 150000 }
            });

            const result = await anthropicLlm.chat(mathAnswerConversation, {
                responseFormat: mathAnswerJsonSchemaFormat
            });

            expect(result.content).to.be.an('object');
            expect(result.content).to.have.property('sum');
            expect(result.content.sum).to.be.a('number');
            expect(result.content).to.have.property('explanationSteps');
            expect(result.content.explanationSteps).to.be.an('array');
            result.content.explanationSteps.forEach(step => expect(step).to.be.a('string'));
        }).timeout(30000);

        it('should support output_config migration passthrough (real fetch)', async () => {
            const conversationHistory = [
                {
                    role: 'user',
                    content: 'Return ONLY a JSON object with one field "status" set to "ok".'
                }
            ];

            const result = await llm.chat(conversationHistory, {
                output_config: { format: { type: 'json_schema' } }
            });

            expect(result.content).to.be.an('object');
            expect(result.content).to.have.property('status');
            expect(result.content.status).to.equal('ok');
        }).timeout(30000);
    });
}); 