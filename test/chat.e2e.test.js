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

            expect(result).to.be.an('object');
            expect(result).to.have.property('answer');
            expect(result).to.have.property('questionId');
        }).timeout(30000);

        it('should respect a basic json_schema response format (real fetch)', async () => {
            const schemaResponseFormat = {
                type: 'json_schema',
                json_schema: {
                    name: 'math_answer',
                    schema: {
                        type: 'object',
                        properties: {
                            sum: { type: 'number' }
                        },
                        required: ['sum']
                    }
                }
            };

            const conversationHistory = [
                {
                    role: 'user',
                    content: 'Add 2 and 3 and respond ONLY with JSON matching the schema where "sum" is the numeric result.'
                }
            ];

            const result = await llm.chat(conversationHistory, {
                responseFormat: schemaResponseFormat
            });

            expect(result).to.be.an('object');
            expect(result).to.have.property('sum');
            expect(result.sum).to.be.a('number');
        }).timeout(30000);

        it('should support snake_case response_format passthrough (real fetch)', async () => {
            const conversationHistory = [
                {
                    role: 'user',
                    content: 'Return ONLY a JSON object with one field "status" set to "ok".'
                }
            ];

            const rawResult = await llm.chat(conversationHistory, {
                response_format: { type: 'json_object' },
                parseStructuredOutput: false
            });
            expect(rawResult).to.be.a('string');

            const raw = rawResult.trim();
            const isFencedJson = /^```(?:json)?\s*[\s\S]*\s*```$/i.test(raw);
            const isPlainJson = !isFencedJson && (() => {
                try {
                    const parsed = JSON.parse(raw);
                    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
                } catch {
                    return false;
                }
            })();
            expect(isFencedJson || isPlainJson).to.equal(true, 'raw response should be plain JSON or fenced JSON');

            const result = await llm.chat(conversationHistory, {
                response_format: { type: 'json_object' }
            });

            expect(result).to.be.an('object');
            expect(result).to.have.property('status');
            expect(result.status).to.equal('ok');
        }).timeout(30000);

        it('should support snake_case output_config passthrough (real fetch)', async () => {
            const conversationHistory = [
                {
                    role: 'user',
                    content: 'Return ONLY a JSON object with one field "status" set to "ok".'
                }
            ];

            const rawResult = await llm.chat(conversationHistory, {
                output_config: { format: { type: 'json_schema' } },
                parseStructuredOutput: false
            });
            expect(rawResult).to.be.a('string');

            const raw = rawResult.trim();
            const isFencedJson = /^```(?:json)?\s*[\s\S]*\s*```$/i.test(raw);
            const isPlainJson = !isFencedJson && (() => {
                try {
                    const parsed = JSON.parse(raw);
                    return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
                } catch {
                    return false;
                }
            })();
            expect(isFencedJson || isPlainJson).to.equal(true, 'raw response should be plain JSON or fenced JSON');

            const result = await llm.chat(conversationHistory, {
                output_config: { format: { type: 'json_schema' } }
            });

            expect(result).to.be.an('object');
            expect(result).to.have.property('status');
            expect(result.status).to.equal('ok');
        }).timeout(30000);
    });
}); 