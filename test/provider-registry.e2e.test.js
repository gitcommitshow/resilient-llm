import { ProviderRegistry } from '../index.js';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';

describe('ProviderRegistry E2E Tests', () => {
    let mockFetch;

    beforeEach(() => {
        mockFetch = sinon.stub();
        global.fetch = mockFetch;
        // Reset and clear cache before each test
        ProviderRegistry.reset();
        ProviderRegistry.clearCache();
    });

    afterEach(() => {
        // Clear cache after each test
        ProviderRegistry.clearCache();
        sinon.restore();
    });

    describe('OpenAI Model Registry', () => {
        it('should fetch models from API and return correct unified schema with raw fields on first call', async () => {
            const mockApiResponse = {
                object: 'list',
                data: [
                    {
                        id: 'gpt-4o-2024-08-06',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'gpt-4o-2024-08-06',
                        parent: null
                    },
                    {
                        id: 'gpt-4o-mini',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'gpt-4o-mini',
                        parent: null
                    },
                    {
                        id: 'o1-preview',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'o1-preview',
                        parent: null
                    }
                ]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockApiResponse
            });

            const models = await ProviderRegistry.getModels('openai', 'test-openai-key');

            // Verify API was called
            sinon.assert.calledOnce(mockFetch);
            sinon.assert.calledWith(
                mockFetch,
                'https://api.openai.com/v1/models',
                sinon.match({
                    method: 'GET',
                    headers: sinon.match({
                        'Authorization': 'Bearer test-openai-key',
                        'Content-Type': 'application/json'
                    })
                })
            );

            // Verify unified schema structure
            expect(models).to.be.an('array');
            expect(models.length).to.equal(3);

            // Check first model structure
            const firstModel = models[0];
            expect(firstModel).to.have.property('id');
            expect(firstModel).to.have.property('provider', 'openai');
            expect(firstModel).to.have.property('name');
            expect(firstModel).to.have.property('raw');

            // Verify specific model data
            expect(firstModel.id).to.equal('gpt-4o-2024-08-06');
            expect(firstModel.name).to.equal('gpt-4o-2024-08-06');

            // Verify raw field contains full API response
            expect(firstModel.raw).to.be.an('object');
            expect(firstModel.raw).to.have.property('id', 'gpt-4o-2024-08-06');
            expect(firstModel.raw).to.have.property('object', 'model');
            expect(firstModel.raw).to.have.property('created', 1727740406);
            expect(firstModel.raw).to.have.property('owned_by', 'openai');

            // Verify all models have raw data
            models.forEach(model => {
                expect(model).to.have.property('raw');
                expect(model.raw).to.be.an('object');
            });
        });

        it('should return models from cache on second call without calling API', async () => {
            const mockApiResponse = {
                object: 'list',
                data: [
                    {
                        id: 'gpt-4o-mini',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'gpt-4o-mini',
                        parent: null
                    }
                ]
            };

            mockFetch.resolves({
                ok: true,
                status: 200,
                json: async () => mockApiResponse
            });

            // First call - should fetch from API
            const firstCall = await ProviderRegistry.getModels('openai', 'test-openai-key');
            expect(firstCall).to.be.an('array');
            expect(firstCall.length).to.equal(1);
            sinon.assert.calledOnce(mockFetch);

            // Reset the stub call count
            mockFetch.resetHistory();

            // Second call - should use cache
            const secondCall = await ProviderRegistry.getModels('openai', 'test-openai-key');
            
            // Verify API was NOT called again
            sinon.assert.notCalled(mockFetch);

            // Verify same data is returned
            expect(secondCall).to.deep.equal(firstCall);
            expect(secondCall.length).to.equal(1);
            expect(secondCall[0].id).to.equal('gpt-4o-mini');
        });

        it('should clear cache and refetch when cache is cleared', async () => {
            const firstMockResponse = {
                object: 'list',
                data: [
                    {
                        id: 'gpt-4o-mini',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'gpt-4o-mini',
                        parent: null
                    }
                ]
            };

            const secondMockResponse = {
                object: 'list',
                data: [
                    {
                        id: 'gpt-4o',
                        object: 'model',
                        created: 1727740406,
                        owned_by: 'openai',
                        permission: [],
                        root: 'gpt-4o',
                        parent: null
                    }
                ]
            };

            // First fetch
            mockFetch.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => firstMockResponse
            });

            const firstCall = await ProviderRegistry.getModels('openai', 'test-openai-key');
            expect(firstCall.length).to.equal(1);
            expect(firstCall[0].id).to.equal('gpt-4o-mini');
            sinon.assert.calledOnce(mockFetch);

            // Verify cache is populated
            expect(ProviderRegistry.isCached('openai')).to.be.true;

            // Clear cache
            ProviderRegistry.clearCache('openai');
            expect(ProviderRegistry.isCached('openai')).to.be.false;

            // Reset stub for second call
            mockFetch.resetHistory();

            // Second fetch with different response
            mockFetch.onFirstCall().resolves({
                ok: true,
                status: 200,
                json: async () => secondMockResponse
            });

            const secondCall = await ProviderRegistry.getModels('openai', 'test-openai-key');
            
            // Verify API was called again after cache clear
            sinon.assert.calledOnce(mockFetch);
            
            // Verify new data is returned
            expect(secondCall.length).to.equal(1);
            expect(secondCall[0].id).to.equal('gpt-4o');
            expect(secondCall[0].id).to.not.equal(firstCall[0].id);
        });
    });
});

