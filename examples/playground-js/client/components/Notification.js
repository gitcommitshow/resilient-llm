/**
 * Notification - Shows temporary notifications (e.g., undo)
 */

export class Notification {
    /**
     * Show an undo notification
     * @param {Function} onUndo - Callback when undo is clicked
     * @param {number} [duration=5000] - Duration in ms
     */
    static showUndo(onUndo, duration = 5000) {
        // Remove existing notification
        let notification = document.getElementById('undoNotification');
        if (notification) notification.remove();
        
        notification = document.createElement('div');
        notification.id = 'undoNotification';
        notification.className = 'undo-notification';
        notification.innerHTML = `
            <span>Action completed</span>
            <button class="undo-btn" id="undoBtn">Undo (⌘Z)</button>
        `;
        document.body.appendChild(notification);
        
        document.getElementById('undoBtn').addEventListener('click', () => {
            if (onUndo) onUndo();
            notification.remove();
        });
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    /**
     * Remove the undo notification if it exists
     */
    static removeUndo() {
        const notification = document.getElementById('undoNotification');
        if (notification) notification.remove();
    }
}

