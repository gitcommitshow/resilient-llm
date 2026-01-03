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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Check if any API keys are set
    const PROVIDERS = ProviderRegistry.list();
    const hasAnyApiKey = Object.values(PROVIDERS).some(provider => {
        return ProviderRegistry.getApiKey(provider.name);
    });
    
    if (!hasAnyApiKey) {
        console.log(`Make sure to set your API key in environment variables:`);
        Object.values(PROVIDERS).forEach(provider => {
            if (provider.id !== 'ollama') {
                console.log(`  - ${provider.envVarName} (for ${provider.displayName})`);
            }
        });
    }
});