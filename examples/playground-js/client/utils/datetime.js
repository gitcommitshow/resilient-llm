/**
 * Date/time formatting utilities
 */

/**
 * Format a date for time display (e.g., "2:30 PM")
 * @param {Date} date
 * @returns {string}
 */
export function formatTime(date) {
    if (!(date instanceof Date)) {
        date = new Date(date);
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format a date as relative time (e.g., "5m ago", "2h ago", "3d ago")
 * @param {string|Date} dateString
 * @returns {string}
 */
export function formatRelativeTime(dateString) {
    if (!dateString) return '';
    
    const date = dateString instanceof Date ? dateString : new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

