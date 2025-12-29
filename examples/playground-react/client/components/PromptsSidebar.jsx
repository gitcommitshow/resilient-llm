/**
 * Prompts Sidebar Component - displays list of prompts
 */
import { useApp } from '../context/AppContext';
import { formatRelativeTime } from '../utils';

export function NewPromptButton() {
    const { createPrompt } = useApp();
    return (
        <button className="new-session-btn" onClick={createPrompt} title="New prompt">
            + New
        </button>
    );
}

export function PromptsSidebar() {
    const { prompts, currentPromptId, openPrompt, deletePrompt, getVersions, getConversations } = useApp();

    return (
        <aside className="sessions-sidebar">
            <div className="sessions-header">
                <h2>Prompts</h2>
                <NewPromptButton />
            </div>
            <div className="sessions-list">
                {prompts.map(prompt => {
                    const versions = getVersions(prompt.id);
                    const convs = getConversations(prompt.id);
                    const vText = versions.length > 0 ? `${versions.length}v` : '';
                    const cText = convs.length > 0 ? `${convs.length}c` : '';
                    const sep = vText && cText ? ' · ' : '';
                    
                    return (
                        <button
                            key={prompt.id}
                            className={`prompt-item ${prompt.id === currentPromptId ? 'active' : ''}`}
                            onClick={() => openPrompt(prompt.id)}
                        >
                            <span className="prompt-icon">📝</span>
                            <div className="prompt-info">
                                <div className="prompt-name">{prompt.name}</div>
                                <div className="prompt-meta">
                                    {vText}{sep}{cText} • {formatRelativeTime(prompt.updatedAt || prompt.createdAt)}
                                </div>
                            </div>
                            <span 
                                className="prompt-indicator" 
                                title="Delete"
                                onClick={(e) => { e.stopPropagation(); deletePrompt(prompt.id); }}
                            />
                        </button>
                    );
                })}
            </div>
        </aside>
    );
}
