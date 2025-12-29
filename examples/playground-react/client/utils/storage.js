/**
 * LocalStorage abstraction for playground data
 */
import { STORAGE_KEY } from './constants';

export const Storage = {
    getData() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return { prompts: [], versions: [], conversations: [] };
            const data = JSON.parse(raw);
            return {
                prompts: data.prompts || [],
                versions: data.versions || [],
                conversations: data.conversations || []
            };
        } catch { 
            return { prompts: [], versions: [], conversations: [] }; 
        }
    },

    setData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    get(collection) {
        return this.getData()[collection] || [];
    },

    set(collection, items) {
        const data = this.getData();
        data[collection] = items;
        this.setData(data);
    }
};
