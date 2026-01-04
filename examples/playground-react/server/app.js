import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ResilientLLM, ProviderRegistry } from 'resilient-llm';
import { getLibraryInfo } from './devutility.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files from client directory
app.use(express.static(join(__dirname, '../client')));

// Initialize ResilientLLM
const llm = new ResilientLLM({
    aiService: process.env.AI_SERVICE || 'openai',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    maxTokens: parseInt(process.env.MAX_TOKENS || '2048'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    rateLimitConfig: {
        requestsPerMinute: parseInt(process.env.REQUESTS_PER_MINUTE || '60'),
        llmTokensPerMinute: parseInt(process.env.LLM_TOKENS_PER_MINUTE || '90000')
    },
    retries: parseInt(process.env.RETRIES || '3'),
    backoffFactor: parseFloat(process.env.BACKOFF_FACTOR || '2')
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { conversationHistory, llmOptions } = req.body;

        if (!conversationHistory || !Array.isArray(conversationHistory)) {
            return res.status(400).json({ 
                error: 'conversationHistory is required and must be an array' 
            });
        }

        // If API key provided in options, configure it for this request
        const providedApiKey = llmOptions?.apiKey;
        const aiService = llmOptions?.aiService || llm.aiService;
        
        if (providedApiKey && aiService) {
            ProviderRegistry.configure(aiService, { apiKey: providedApiKey });
        }

        const response = await llm.chat(conversationHistory, llmOptions || {});
        
        res.json({ 
            response,
            success: true 
        });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        res.status(500).json({ 
            error: error.message || 'An error occurred while processing your request',
            success: false 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Library info endpoint
app.get('/api/library-info', (req, res) => {
    res.json(getLibraryInfo());
});

// LLM configuration endpoint - returns current values from the llm instance
app.get('/api/config', (req, res) => {
    res.json({
        aiService: llm.aiService,
        model: llm.model,
        maxTokens: llm.maxTokens,
        temperature: llm.temperature,
        topP: llm.topP
    });
});

// Models endpoint - returns available models for a service
app.get('/api/models', async (req, res) => {
    try {
        const { service, apiKey, ollamaUrl } = req.query;
        
        if (!service) {
            return res.status(400).json({ 
                error: 'service query parameter is required' 
            });
        }

        // Normalize service name (handle 'local' -> 'ollama')
        const normalizedService = service === 'local' ? 'ollama' : service;
        
        const options = {};
        if (normalizedService === 'ollama' && ollamaUrl) {
            options.ollamaUrl = ollamaUrl;
        }

        const models = await ProviderRegistry.getModels(normalizedService, apiKey || null, options);
        
        res.json({ 
            models,
            success: true 
        });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({ 
            error: error.message || 'An error occurred while fetching models',
            success: false 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Check if any API keys are set
    const providers = ProviderRegistry.list();
    const hasAnyApiKey = providers.some(provider => ProviderRegistry.hasApiKey(provider.id));
    
    if (!hasAnyApiKey) {
        console.log(`Make sure to set your API key in environment variables:`);
        providers.forEach(provider => {
            if (provider.name !== 'ollama' && provider.envVarNames?.length > 0) {
                console.log(`  - ${provider.envVarNames.join(' or ')} (for ${provider.displayName})`);
            }
        });
    }
});