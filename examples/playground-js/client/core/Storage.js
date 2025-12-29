/**
 * LocalStorage abstraction with JSON serialization
 * Handles all persistent data for the playground
 */

const STORAGE_KEY = 'resilientllm_playground_v3';

/**
 * Get the raw data object from localStorage
 * @returns {Object}
 */
function getData() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { prompts: [], versions: [], conversations: [] };
        }
        const data = JSON.parse(raw);
        return {
            prompts: data.prompts || [],
            versions: data.versions || [],
            conversations: data.conversations || []
        };
    } catch {
        return { prompts: [], versions: [], conversations: [] };
    }
}

/**
 * Save the data object to localStorage
 * @param {Object} data
 */
function setData(data) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const Storage = {
    /**
     * Get all items in a collection
     * @param {'prompts'|'versions'|'conversations'} collection
     * @returns {Array}
     */
    get(collection) {
        const data = getData();
        return data[collection] || [];
    },

    /**
     * Set all items in a collection
     * @param {'prompts'|'versions'|'conversations'} collection
     * @param {Array} items
     */
    set(collection, items) {
        const data = getData();
        data[collection] = items;
        setData(data);
    },

    /**
     * Get the full storage data (for debugging/export)
     * @returns {Object}
     */
    getAll() {
        return getData();
    },

    /**
     * Clear all data (use with caution!)
     */
    clear() {
        window.localStorage.removeItem(STORAGE_KEY);
    }
};

