// API Integration with ResilientLLM
// This file handles communication with the ResilientLLM backend

const API_URL = 'http://localhost:3000/api/chat';

/**
 * Build conversation history from messages array
 * Formats messages for ResilientLLM API
 * @param {Array} messages - Array of message objects with role and text
 * @param {string} systemPrompt - Optional system prompt to use
 * @returns {Array} - Formatted conversation history
 */
function buildConversationHistory(messages, systemPrompt = null) {
    const history = [];
    
    // Find system message in chat (if it exists, use it; otherwise use systemPrompt parameter)
    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
        // Use system message from chat
        history.push({
            role: 'system',
            content: systemMessage.text
        });
    } else if (systemPrompt?.trim()) {
        // Fall back to systemPrompt parameter if no system message in chat
        history.push({
            role: 'system',
            content: systemPrompt.trim()
        });
    } else {
        // Default system prompt
        history.push({
            role: 'system',
            content: 'You are a helpful AI assistant powered by ResilientLLM.'
        });
    }
    
    // Add all non-system messages to history (convert roles for API compatibility)
    messages.forEach(msg => {
        // Skip system messages (they're handled above)
        if (msg.role === 'system') {
            return;
        }
        
        // Convert roles for API: assistant_manual -> assistant, user_manual -> user
        let role = msg.role;
        if (role === 'assistant_manual') {
            role = 'assistant';
        } else if (role === 'user_manual') {
            role = 'user';
        }
        
        history.push({
            role: role,
            content: msg.text
        });
    });
    return history;
}

/**
 * Call the backend API to get LLM response
 * 
 * ResilientLLM handles all the complexity automatically:
 * - Rate limiting (requests per minute, tokens per minute)
 * - Automatic retries with exponential backoff
 * - Circuit breaker for service resilience
 * - Token estimation
 * - Error handling and recovery
 * 
 * @param {Array} conversationHistory - Array of messages with role and content
 * @param {Object} llmOptions - Optional LLM configuration options
 * @returns {Promise<string>} - The AI response text
 */
async function getAIResponse(conversationHistory, llmOptions = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationHistory: conversationHistory,
                llmOptions: llmOptions
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        if (data.success && data.response) {
            return data.response;
        } else {
            throw new Error(data.error || 'No response from server');
        }
    } catch (error) {
        console.error('Error calling API:', error);
        throw error;
    }
}

