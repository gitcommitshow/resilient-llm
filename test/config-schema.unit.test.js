import { normalizeResilienceConfig, safeDelay, RESILIENCE_SCHEMA, MAX_TIMER_MS } from '../dist/lib/ConfigSchema.js';
import { ResilientLLM, ResilientLLMError } from '../dist/index.js';
import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

describe('ConfigSchema', () => {
    describe('normalizeResilienceConfig', () => {
        it('clamps an oversized timeout to the platform maximum and emits config_clamped', () => {
            const { values, events } = normalizeResilienceConfig({
                timeout: 3_000_000_000,
                retries: 3,
                backoffFactor: 2,
                failureThreshold: 5,
                cooldownPeriod: 30000,
                requestsPerMinute: 10,
                llmTokensPerMinute: 150000,
            });

            expect(values.timeout).to.equal(MAX_TIMER_MS);
            const clampEvent = events.find(e => e.field === 'timeout' && e.type === 'config_clamped');
            expect(clampEvent).to.exist;
            expect(clampEvent.requested).to.equal(3_000_000_000);
            expect(clampEvent.effective).to.equal(MAX_TIMER_MS);
        });

        it('falls back to defaults for non-numeric env-style values and emits config_clamped', () => {
            const { values, events } = normalizeResilienceConfig({
                timeout: '60s',
                retries: 'three',
                backoffFactor: NaN,
                failureThreshold: 5,
                cooldownPeriod: 30000,
                requestsPerMinute: 10,
                llmTokensPerMinute: 150000,
            });

            expect(values.timeout).to.equal(RESILIENCE_SCHEMA.timeout.default);
            expect(values.retries).to.equal(RESILIENCE_SCHEMA.retries.default);
            expect(values.backoffFactor).to.equal(RESILIENCE_SCHEMA.backoffFactor.default);

            const timeoutClamp = events.find(e => e.field === 'timeout' && e.type === 'config_clamped');
            expect(timeoutClamp).to.exist;
            expect(timeoutClamp.reason).to.include('not a finite number');

            const retriesClamp = events.find(e => e.field === 'retries' && e.type === 'config_clamped');
            expect(retriesClamp).to.exist;

            const backoffClamp = events.find(e => e.field === 'backoffFactor' && e.type === 'config_clamped');
            expect(backoffClamp).to.exist;
        });

        it('emits config_unwise when timeout is too short for retries and backoff', () => {
            const { values, events } = normalizeResilienceConfig({
                timeout: 2000,
                retries: 5,
                backoffFactor: 2,
                failureThreshold: 5,
                cooldownPeriod: 30000,
                requestsPerMinute: 10,
                llmTokensPerMinute: 150000,
            });

            // Value stays as requested - not clamped, only warned
            expect(values.timeout).to.equal(2000);
            expect(values.retries).to.equal(5);

            const unwiseEvent = events.find(e => e.field === 'timeout' && e.type === 'config_unwise');
            expect(unwiseEvent).to.exist;
            expect(unwiseEvent.reason).to.include('shorter than the estimated backoff');
        });
    });

    describe('safeDelay', () => {
        it('clamps values above the 32-bit timer max', () => {
            expect(safeDelay(3_000_000_000)).to.equal(MAX_TIMER_MS);
        });

        it('returns 1 for non-finite or non-positive values', () => {
            expect(safeDelay(NaN)).to.equal(1);
            expect(safeDelay(-100)).to.equal(1);
            expect(safeDelay(Infinity)).to.equal(1);
            expect(safeDelay(0)).to.equal(1);
        });

        it('passes through valid values unchanged', () => {
            expect(safeDelay(5000)).to.equal(5000);
            expect(safeDelay(1)).to.equal(1);
            expect(safeDelay(MAX_TIMER_MS)).to.equal(MAX_TIMER_MS);
        });
    });

    describe('TIMEOUT error code wiring (parseError)', () => {
        afterEach(() => sinon.restore());

        it('surfaces a TimeoutError as TIMEOUT code instead of PROVIDER_ERROR', () => {
            const llm = new ResilientLLM({ aiService: 'openai', model: 'gpt-5-nano' });
            const timeoutErr = new Error('Operation timed out after 60000ms');
            timeoutErr.name = 'TimeoutError';
            try {
                llm.parseError(null, timeoutErr);
            } catch (e) {
                expect(e).to.be.instanceOf(ResilientLLMError);
                expect(e.code).to.equal('TIMEOUT');
                expect(e.message).to.include('timed out');
                return;
            }
            throw new Error('Expected parseError to throw');
        });

        it('surfaces an AbortError as ABORTED code instead of PROVIDER_ERROR', () => {
            const llm = new ResilientLLM({ aiService: 'openai', model: 'gpt-5-nano' });
            const abortErr = new Error('Operation was aborted');
            abortErr.name = 'AbortError';
            try {
                llm.parseError(null, abortErr);
            } catch (e) {
                expect(e).to.be.instanceOf(ResilientLLMError);
                expect(e.code).to.equal('ABORTED');
                return;
            }
            throw new Error('Expected parseError to throw');
        });
    });
});
