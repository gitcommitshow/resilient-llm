import RateLimitManager from '../dist/lib/RateLimitManager.js';
import { describe, it, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

describe('RateLimitManager Unit Tests', () => {
    afterEach(() => {
        sinon.restore();
    });

    it('should not consume request token while llmTokenBucket has no tokens', async () => {
        const manager = new RateLimitManager({
            requestsPerMinute: 5,
            llmTokensPerMinute: 5
        });
        const clock = sinon.useFakeTimers();

        const llmTryRemoveStub = sinon.stub(manager.llmTokenBucket, 'tryRemoveToken');
        llmTryRemoveStub.onFirstCall().returns(false);
        llmTryRemoveStub.onSecondCall().returns(true);

        const requestTryRemoveStub = sinon.stub(manager.requestBucket, 'tryRemoveToken').returns(true);

        const acquirePromise = manager.acquire(1);

        await clock.tickAsync(0);

        await clock.tickAsync(100);
        await acquirePromise;

        expect(llmTryRemoveStub.callCount).to.equal(2);
        expect(requestTryRemoveStub.callCount).to.equal(1);
        clock.restore();
    });

    it('should fail fast when requested llm tokens exceed llmTokenBucket capacity', async () => {
        const manager = new RateLimitManager({
            requestsPerMinute: 5,
            llmTokensPerMinute: 5
        });

        const initialRequestTokens = manager.requestBucket.getAvailableTokens();
        const initialLlmTokens = manager.llmTokenBucket.getAvailableTokens();
        const requestTryRemoveSpy = sinon.spy(manager.requestBucket, 'tryRemoveToken');
        let caughtError;

        try {
            await manager.acquire(6);
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).to.be.instanceOf(Error);
        expect(caughtError.name).to.equal('OversizedRequestError');
        expect(caughtError.message).to.equal('Cannot remove more tokens than the bucket capacity');
        sinon.assert.notCalled(requestTryRemoveSpy);
        expect(manager.requestBucket.getAvailableTokens()).to.equal(initialRequestTokens);
        expect(manager.llmTokenBucket.getAvailableTokens()).to.equal(initialLlmTokens);
    });

    it('should not consume llm tokens when request bucket cannot hold required token', async () => {
        const manager = new RateLimitManager({
            requestsPerMinute: 0,
            llmTokensPerMinute: 5
        });

        const initialRequestTokens = manager.requestBucket.getAvailableTokens();
        const initialLlmTokens = manager.llmTokenBucket.getAvailableTokens();
        const llmTryRemoveSpy = sinon.spy(manager.llmTokenBucket, 'tryRemoveToken');
        let caughtError;

        try {
            await manager.acquire(1);
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).to.be.instanceOf(Error);
        expect(caughtError.name).to.equal('OversizedRequestError');
        expect(caughtError.message).to.equal('Cannot remove more tokens than the bucket capacity');
        sinon.assert.calledOnce(llmTryRemoveSpy);
        expect(manager.requestBucket.getAvailableTokens()).to.equal(initialRequestTokens);
        expect(manager.llmTokenBucket.getAvailableTokens()).to.equal(initialLlmTokens);
    });

    it('should not consume request tokens when llm bucket cannot hold required tokens', async () => {
        const manager = new RateLimitManager({
            requestsPerMinute: 5,
            llmTokensPerMinute: 5
        });

        const initialRequestTokens = manager.requestBucket.getAvailableTokens();
        const initialLlmTokens = manager.llmTokenBucket.getAvailableTokens();
        const llmTryRemoveSpy = sinon.spy(manager.llmTokenBucket, 'tryRemoveToken');
        const requestTryRemoveSpy = sinon.spy(manager.requestBucket, 'tryRemoveToken');
        let caughtError;

        try {
            await manager.acquire(6);
        } catch (error) {
            caughtError = error;
        }

        expect(caughtError).to.be.instanceOf(Error);
        expect(caughtError.name).to.equal('OversizedRequestError');
        expect(caughtError.message).to.equal('Cannot remove more tokens than the bucket capacity');
        sinon.assert.calledOnce(llmTryRemoveSpy);
        sinon.assert.notCalled(requestTryRemoveSpy);
        expect(manager.requestBucket.getAvailableTokens()).to.equal(initialRequestTokens);
        expect(manager.llmTokenBucket.getAvailableTokens()).to.equal(initialLlmTokens);
    });
});
