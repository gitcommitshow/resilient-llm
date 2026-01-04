/**
 * Provider Utilities for UI Components
 * 
 * This file provides provider-related utilities for the React playground.
 * It should be kept in sync with the main library's ProviderRegistry.
 * 
 * For the main library, see: ../../../../lib/ProviderRegistry.js
 */

/**
 * Provider display names mapping
 * Maps service IDs to human-readable display names
 */
export const PROVIDER_DISPLAY_NAMES = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    ollama: 'Ollama',
    local: 'Local / Other' // Special case for UI
};

/**
 * Get display name for a provider
 * @param {string} providerId - Provider identifier
 * @returns {string} Display name or providerId if not found
 */
export function getProviderDisplayName(providerId) {
    if (providerId === 'local') {
        return PROVIDER_DISPLAY_NAMES.local;
    }
    return PROVIDER_DISPLAY_NAMES[providerId] || providerId;
}

/**
 * Get all provider IDs (excluding 'local' which is UI-only)
 * @returns {string[]} Array of provider IDs
 */
export function getProviderIds() {
    return ['openai', 'anthropic', 'google', 'ollama'];
}

/**
 * Check if a provider ID is valid
 * @param {string} providerId - Provider identifier to validate
 * @returns {boolean} True if provider is valid
 */
export function isValidProvider(providerId) {
    return providerId === 'local' || providerId in PROVIDER_DISPLAY_NAMES;
}

