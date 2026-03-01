import TokenBucket from '../lib/TokenBucket.js';
import { describe, it } from 'mocha';
import { expect } from 'chai';

describe('TokenBucket Unit Tests', () => {
    it('should throw OversizedRequestError when requested tokens exceed capacity', () => {
        const tokenBucket = new TokenBucket(10, 10);

        expect(() => tokenBucket.tryRemoveToken(11)).to.throw('Cannot remove more tokens than the bucket capacity');
        expect(() => tokenBucket.tryRemoveToken(11)).to.throw().with.property('name', 'OversizedRequestError');
    });
});
