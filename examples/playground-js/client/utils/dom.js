/**
 * DOM helper functions
 */

/**
 * Create an element with optional class and attributes
 * @param {string} tag - HTML tag name
 * @param {string} [className] - CSS class name(s)
 * @param {Object} [attributes] - Additional attributes
 * @returns {HTMLElement}
 */
export function createElement(tag, className, attributes = {}) {
    const el = document.createElement(tag);
    if (className) {
        el.className = className;
    }
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'textContent') {
            el.textContent = value;
        } else if (key === 'innerHTML') {
            el.innerHTML = value;
        } else {
            el.setAttribute(key, value);
        }
    });
    return el;
}

/**
 * Clear all children from an element
 * @param {HTMLElement} el
 */
export function clearElement(el) {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

/**
 * Scroll an element to its bottom
 * @param {HTMLElement} el
 */
export function scrollToBottom(el) {
    el.scrollTop = el.scrollHeight;
}

/**
 * Auto-resize a textarea based on its content
 * @param {HTMLTextAreaElement} textarea
 */
export function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * Generate a unique ID
 * @param {string} [prefix] - Optional prefix
 * @returns {string}
 */
export function generateId(prefix = '') {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    return prefix ? `${prefix}-${id}` : id;
}

