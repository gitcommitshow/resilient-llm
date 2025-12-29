/**
 * Markdown rendering wrapper
 * Uses the marked library loaded via CDN
 */

/**
 * Render markdown text as HTML
 * @param {string} text - Markdown text to render
 * @returns {string} - HTML string
 */
export function renderMarkdown(text) {
    if (typeof marked === 'undefined') {
        console.warn('Marked library not loaded, displaying plain text');
        return escapeHtml(text);
    }
    
    try {
        return marked.parse(text);
    } catch (error) {
        console.error('Error parsing markdown:', error);
        return escapeHtml(text);
    }
}

/**
 * Escape HTML entities for safe display
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

