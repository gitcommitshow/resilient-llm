import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ResilientLLM } from 'resilient-llm';
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
    let originalGetApiKey = null;
    try {
        const { conversationHistory, llmOptions } = req.body;

        if (!conversationHistory || !Array.isArray(conversationHistory)) {
            return res.status(400).json({ 
                error: 'conversationHistory is required and must be an array' 
            });
        }

        // If API key provided in options, temporarily override getApiKey
        const providedApiKey = llmOptions?.apiKey;
        const aiService = llmOptions?.aiService || llm.aiService;
        
        // Store original getApiKey method
        originalGetApiKey = llm.getApiKey.bind(llm);
        
        // Override getApiKey if API key is provided in request
        if (providedApiKey && aiService) {
            llm.getApiKey = function(service) {
                // Use provided key for the requested service, otherwise fall back to env
                if (service === aiService) {
                    return providedApiKey;
                }
                return originalGetApiKey(service);
            };
        }

        const response = await llm.chat(conversationHistory, llmOptions || {});
        
        // Restore original getApiKey method
        if (providedApiKey && originalGetApiKey) {
            llm.getApiKey = originalGetApiKey;
        }
        
        res.json({ 
            response,
            success: true 
        });
    } catch (error) {
        // Restore original getApiKey method on error
        if (originalGetApiKey) {
            llm.getApiKey = originalGetApiKey;
        }
        
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if(!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
        console.log(`Make sure to set your API key in environment variables:`);
        console.log(`  - OPENAI_API_KEY (for OpenAI)`);
        console.log(`  - ANTHROPIC_API_KEY (for Anthropic)`);
        console.log(`  - GEMINI_API_KEY (for Gemini)`);
    }
});