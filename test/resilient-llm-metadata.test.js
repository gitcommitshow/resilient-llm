import { ResilientLLM } from '../dist/index.js';
import CircuitBreaker from '../dist/lib/CircuitBreaker.js';
import RateLimitManager from '../dist/lib/RateLimitManager.js';
import ResilientOperation from '../dist/lib/ResilientOperation.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

use(chaiAsPromised);

function makeHeaders(obj = {}) {
    const map = new Map(Object.entries(obj));
    return {
        get: (key) => map.get(key) ?? null,
        entries: () => map.entries(),
    };
}

function mockFetchOk(content = 'Hello from the AI!', extraHeaders = {}) {
    return sinon.stub().resolves({
        json: () => Promise.resolve({
            choices: [{ message: { content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }),
        status: 200,
        headers: makeHeaders({
            'x-ratelimit-remaining-requests': '9',
            'x-request-id': 'req-abc123',
            ...extraHeaders,
        }),
    });
}

describe('ResilientLLM Metadata (Phase 1)', () => {
    let originalEnv;
    const bucketId = 'openai';

    beforeEach(() => {
        originalEnv = { ...process.env };
        process.env.OPENAI_API_KEY = 'test-key';
        CircuitBreaker.clear(bucketId);
        RateLimitManager.clear(bucketId);
        ResilientOperation.clearConcurrencyCounts(bucketId);
    });

    afterEach(() => {
        process.env = originalEnv;
        sinon.restore();
    });

    it('happy path: returns { content, metadata } with populated fields', async () => {
        global.fetch = mockFetchOk('Test response');

        const llm = new ResilientLLM({
            aiService: 'openai',
            model: 'gpt-4o-mini',
            maxTokens: 1024,
            temperature: 0.5,
        });

        const result = await llm.chat([{ role: 'user', content: 'Hi' }]);

        expect(result).to.be.an('object');
        expect(result).to.have.property('content', 'Test response');
        expect(result).to.have.property('metadata');

        const { metadata } = result;
        expect(metadata.requestId).to.be.a('string').and.not.be.empty;
        expect(metadata.operationId).to.be.a('string').and.not.be.empty;
        expect(metadata.startTime).to.be.a('number');
        expect(metadata.finishReason).to.equal('stop');

        expect(metadata.config.aiService).to.equal('openai');
        expect(metadata.config.model).to.equal('gpt-4o-mini');
        expect(metadata.config.temperature).to.equal(0.5);
        expect(metadata.config.maxTokens).to.equal(1024);

        expect(metadata.timing.totalTimeMs).to.be.a('number').and.to.be.at.least(0);
        expect(metadata.timing.httpRequestMs).to.be.a('number').and.to.be.at.least(0);
        expect(metadata.timing.rateLimitWaitMs).to.be.a('number');

        expect(metadata.rateLimiting.requestedTokens).to.be.a('number').and.to.be.above(0);
        expect(metadata.rateLimiting.totalWaitMs).to.be.a('number');

        expect(metadata.circuitBreaker).to.be.an('object');
        expect(metadata.cache).to.be.an('object');

        expect(metadata.http.url).to.be.a('string');
        expect(metadata.http.statusCode).to.equal(200);
        expect(metadata.http.headers).to.have.property('x-request-id', 'req-abc123');
        expect(metadata.http.headers).to.not.have.property('authorization');

        expect(metadata.service.attempted).to.deep.equal(['openai']);
        expect(metadata.service.final).to.equal('openai');
    }).timeout(15000);

    it('edge case: default (no flag) returns envelope with metadata', async () => {
        global.fetch = mockFetchOk('Plain response');

        const llm = new ResilientLLM({
            aiService: 'openai',
            model: 'gpt-4o-mini',
            maxTokens: 1024,
        });

        const result = await llm.chat([{ role: 'user', content: 'Hi' }]);

        expect(result).to.have.property('content', 'Plain response');
        expect(result).to.have.property('metadata');
    }).timeout(15000);

});
