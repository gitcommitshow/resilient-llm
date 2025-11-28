// API Integration with ResilientLLM
// This file handles communication with the ResilientLLM backend

const API_URL = 'http://localhost:3000/api/chat';

/**
 * Build conversation history from messages array
 * Formats messages for ResilientLLM API
 */
function buildConversationHistory(messages) {
    const history = [];
    // Add system message if this is the first user message
    if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'user')) {
        history.push({
            role: 'system',
            content: 'You are a helpful AI assistant powered by ResilientLLM.'
        });
    }
    // Add all messages to history
    messages.forEach(msg => {
        history.push({
            role: msg.role,
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
 * @returns {Promise<string>} - The AI response text
 */
async function getAIResponse(conversationHistory) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationHistory: conversationHistory
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

