/**
 * API Key management utilities
 */
import { API_KEYS_KEY } from './constants';

/**
 * Load all API keys from localStorage
 */
export const loadApiKeys = () => {
    try { 
        return JSON.parse(localStorage.getItem(API_KEYS_KEY)) || {}; 
    } catch { 
        return {}; 
    }
};

/**
 * Save an API key for a service
 */
export const saveApiKey = (service, key) => {
    const keys = loadApiKeys();
    if (key?.trim()) keys[service] = key.trim();
    else delete keys[service];
    localStorage.setItem(API_KEYS_KEY, JSON.stringify(keys));
};

/**
 * Get API key for a specific service
 */
export const getApiKey = (service) => loadApiKeys()[service] || '';
