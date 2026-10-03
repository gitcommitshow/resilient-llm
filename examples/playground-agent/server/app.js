import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ResilientLLM, ProviderRegistry } from 'resilient-llm';
import { getLibraryInfo } from './devutility.js';
import { withAgentTools } from './tools.js';
import {
    assignToolCallIds,
    stagePendingToolTurn,
    clearTurn,
    findTurn,
    resultsForDecisions,
    continuationHistory
} from './toolTurn.js';

const CURRENT_TIME_LINE = /^Current date and time: .+$/m;

/**
 * Adds the current date and time to the system prompt on this request.
 * Replaces an older line so a follow-up call does not stack timestamps.
 * @param {Array<{ role?: string, content?: string }>} conversationHistory
 * @returns {Array<{ role?: string, content?: string }>}
 */
function withCurrentDateTime(conversationHistory) {
    const line = `Current date and time: ${new Date().toString()}`;
    const history = conversationHistory.map((message) => ({ ...message }));
    let systemIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'system') {
            systemIndex = i;
            break;
        }
    }
    if (systemIndex === -1) {
        history.unshift({ role: 'system', content: line });
        return history;
    }
    const content = typeof history[systemIndex].content === 'string' ? history[systemIndex].content : '';
    const stripped = content.replace(CURRENT_TIME_LINE, '').trim();
    history[systemIndex] = {
        ...history[systemIndex],
        content: stripped ? `${stripped}\n\n${line}` : line
    };
    return history;
}

/**
 * Returns a chat payload and stages tool calls so a later decision can resume this turn.
 * @param {object[]} history
 * @param {object} llmOptions
 * @param {{ content: unknown, toolCalls?: unknown, metadata?: object }} result
 */
function publishChatTurn(history, llmOptions, result) {
    const toolCalls = assignToolCallIds(result.toolCalls);
    if (toolCalls.length) {
        stagePendingToolTurn({
            history,
            llmOptions,
            content: result.content,
            toolCalls
        });
    }
    return {
        content: result.content,
        ...(toolCalls.length ? { toolCalls } : {}),
        metadata: result.metadata
    };
}

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
    model: process.env.AI_MODEL || 'gpt-5-nano',
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

        // Pass llmOptions through; ResilientLLM.chat will use llmOptions.apiKey (if provided).
        // Tool calls are staged by id. They run only after /api/tool-decision resumes the turn.
        const options = llmOptions || {};
        const history = withCurrentDateTime(conversationHistory);
        const result = await llm.chat(history, withAgentTools(options));
        if (result.metadata && !result.metadata.usage) {
            console.warn('[playground-agent] Operation metadata missing usage; ensure server uses local resilient-llm (npm run playground:agent from repo root).');
        }

        res.json({
            success: true,
            ...publishChatTurn(history, options, result)
        });
    } catch (error) {
        console.error('Error in chat endpoint:', error);
        const isAborted =
            error?.name === 'AbortError'
            || error?.code === 'ABORTED'
            || /aborted|cancelled/i.test(error?.message || '');
        res.status(isAborted ? 499 : 500).json({
            error: isAborted
                ? 'Request aborted'
                : (error.message || 'An error occurred while processing your request'),
            success: false,
            aborted: isAborted,
            ...(error.metadata && { metadata: error.metadata })
        });
    }
});

/**
 * Resumes a staged tool turn. The body is only the decision for each tool id.
 * Approved calls run, denied calls return a denial result, then the model continues.
 */
app.post('/api/tool-decision', async (req, res) => {
    let turn;
    let results;
    try {
        const decisions = req.body?.decisions;
        turn = findTurn(decisions);
        try {
            results = await resultsForDecisions(turn, decisions);
        } catch (error) {
            console.error('Tool call failed:', error);
            clearTurn(turn);
            return res.status(500).json({
                error: error?.message || 'Tool call failed',
                success: false,
                toolFailed: true
            });
        }

        clearTurn(turn);
        const history = withCurrentDateTime(continuationHistory(turn, results));
        const followUp = await llm.chat(history, withAgentTools(turn.llmOptions || {}));
        res.json({
            success: true,
            toolResults: results,
            ...publishChatTurn(history, turn.llmOptions || {}, followUp)
        });
    } catch (error) {
        console.error('Error in tool-decision endpoint:', error);
        const isAborted =
            error?.name === 'AbortError'
            || error?.code === 'ABORTED'
            || /aborted|cancelled/i.test(error?.message || '');
        res.status(isAborted ? 499 : 500).json({
            error: isAborted
                ? 'Request aborted'
                : (error.message || 'Failed to continue the tool call'),
            success: false,
            toolFailed: !results,
            aborted: isAborted,
            ...(results ? { toolResults: results } : {}),
            ...(error.metadata && { metadata: error.metadata })
        });
    }
});

/** Cancel the in-flight ResilientLLM request (if any). */
app.post('/api/abort', (req, res) => {
    try {
        llm.abort();
        res.json({ success: true, aborted: true });
    } catch (error) {
        console.error('Error in abort endpoint:', error);
        res.status(500).json({
            error: error.message || 'Failed to abort request',
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
        topP: llm.topP,
        responseFormat: llm.responseFormat,
        retries: llm.retries,
        backoffFactor: llm.backoffFactor,
        timeout: llm.timeout,
        rateLimitConfig: llm.rateLimitConfig,
        circuitBreakerConfig: llm.circuitBreakerConfig,
        maxConcurrent: llm.maxConcurrent
    });
});

// Models endpoint - returns available models for a service
app.get('/api/models', async (req, res) => {
    try {
        const { service, apiKey, baseUrl } = req.query;
        
        if (!service) {
            return res.status(400).json({ 
                error: 'service query parameter is required' 
            });
        }

        // Normalize service name (handle 'local' -> 'ollama')
        const normalizedService = service === 'local' ? 'ollama' : service;
        
        // Configure provider with baseUrl if provided (e.g., for Ollama)
        if (baseUrl) {
            ProviderRegistry.configure(normalizedService, { baseUrl });
        }

        const models = await ProviderRegistry.getModels(normalizedService, apiKey || null);
        
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
    const hasAnyApiKey = providers.some(provider => ProviderRegistry.hasApiKey(provider?.name));

    if (!hasAnyApiKey) {
        console.log(`Make sure to set your API key in environment variables:`);
        providers.forEach(provider => {
            if (provider.name !== 'ollama' && provider.envVarNames?.length > 0) {
                console.log(`  - ${provider.envVarNames.join(' or ')} (for ${provider.displayName})`);
            }
        });
    }
});