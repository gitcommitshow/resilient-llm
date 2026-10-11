/**
 * Helper utility functions
 */
import { marked } from 'marked';

/**
 * Generate a unique ID
 */
export const generateId = () => 
    Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/**
 * Format time for display (e.g., "2:30 PM")
 */
export const formatTime = (date) => 
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/**
 * Format relative time (e.g., "5m ago", "2h ago")
 */
export const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

/**
 * Render markdown text to HTML
 */
export const renderMarkdown = (text) => {
    if (!text) return '';
    try {
        return marked.parse(text);
    } catch {
        return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
