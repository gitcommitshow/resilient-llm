/**
 * Undo Notification Component - toast for undo action
 */
import { useApp } from '../context/AppContext';

export function UndoNotification() {
    const { undoNotification, undo, hideUndoNotification } = useApp();
    
    if (!undoNotification) return null;
    
    return (
        <div className="undo-notification">
            <span>Action completed</span>
            <button 
                className="undo-btn" 
                onClick={() => { undo(); hideUndoNotification(); }}
            >
                Undo (⌘Z)
            </button>
        </div>
    );
}
