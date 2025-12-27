// API Integration with ResilientLLM
// This file handles communication with the ResilientLLM backend

const API_URL = 'http://localhost:3000/api/chat';

/**
 * Build conversation history from messages array
 * Formats messages for ResilientLLM API
 * @param {Array} messages - Array of message objects with role and text
 * @returns {Array} - Formatted conversation history
 */
function buildConversationHistory(messages) {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.text
    }));
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

