/**
 * Undo Notification Component - toast for undo action
 */
import { useApp } from '../context/AppContext';
import { FaUndo } from 'react-icons/fa';

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
                <FaUndo style={{ marginRight: '6px' }} />
                Undo (⌘Z)
            </button>
        </div>
    );
}
