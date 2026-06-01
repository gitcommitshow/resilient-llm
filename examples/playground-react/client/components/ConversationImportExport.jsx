/**
 * Export/import controls for the active conversation (kebab menu).
 */
import { useRef, useState } from 'react';
import { useApp } from '../context';
import { FaEllipsisV } from 'react-icons/fa';

export function ConversationImportExport() {
    const {
        messages,
        currentPromptId,
        isResponding,
        exportConversation,
        importConversation
    } = useApp();
    const fileInputRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);

    const canExport = messages.length > 0 && !isResponding;
    const canImport = !!currentPromptId && !isResponding;
    const menuEnabled = !!currentPromptId && !isResponding;

    const closeMenu = () => setMenuOpen(false);

    const handleExport = (format) => {
        closeMenu();
        const result = exportConversation(format);
        if (!result.ok) alert(result.error);
    };

    const handleImportClick = () => {
        if (!canImport) return;
        closeMenu();
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const result = await importConversation(file);
        if (!result.ok) alert(result.error);
    };

    return (
        <div className="conversation-import-export-actions">
            <button
                type="button"
                className="conversation-import-export-kebab"
                disabled={!menuEnabled}
                onClick={() => setMenuOpen(open => !open)}
                tabIndex={6}
                title="Conversation options"
                aria-label="Conversation options"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
            >
                <FaEllipsisV />
            </button>
            {menuOpen && menuEnabled && (
                <>
                    <div
                        className="conversation-import-export-backdrop"
                        onClick={closeMenu}
                        aria-hidden="true"
                    />
                    <div className="conversation-import-export-menu" role="menu">
                        <button
                            type="button"
                            role="menuitem"
                            disabled={!canExport}
                            onClick={() => handleExport('json')}
                        >
                            Export as JSON
                        </button>
                        <button
                            type="button"
                            role="menuitem"
                            disabled={!canExport}
                            onClick={() => handleExport('text')}
                        >
                            Export as text
                        </button>
                        <div className="conversation-import-export-menu-divider" role="separator" />
                        <button
                            type="button"
                            role="menuitem"
                            disabled={!canImport}
                            onClick={handleImportClick}
                        >
                            Import conversation
                        </button>
                    </div>
                </>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,.txt,.md,application/json,text/plain"
                className="conversation-import-export-file-input"
                onChange={handleFileChange}
                tabIndex={-1}
                aria-hidden="true"
            />
        </div>
    );
}
