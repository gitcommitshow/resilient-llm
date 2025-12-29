/**
 * Version Bar Component - displays versions and conversations
 */
import { useApp } from '../context/AppContext';

export function VersionBar() {
    const { 
        currentPromptId, activeConversationId, 
        getVersions, getConversations,
        loadVersion, deleteVersion, 
        switchConversation, deleteConversation, newConversation
    } = useApp();

    const versions = currentPromptId ? getVersions(currentPromptId) : [];
    const conversations = currentPromptId ? getConversations(currentPromptId) : [];

    return (
        <div className="versions-drafts-bar">
            <div className="versions-section">
                <span className="section-label">Versions:</span>
                <div className="versions-container">
                    {versions.length === 0 ? (
                        <span className="versions-empty">No saved versions</span>
                    ) : versions.map(v => (
                        <div 
                            key={v.id} 
                            className="version-pill"
                            onClick={() => loadVersion(v.id)}
                            title={v.notes || `Click to load`}
                        >
                            <span className="version-pill-label">
                                {v.id} ({v.messages?.filter(m => m.role !== 'system').length || 0})
                            </span>
                            <button 
                                className="version-pill-delete"
                                onClick={e => { e.stopPropagation(); deleteVersion(v.id); }}
                            >×</button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="conversations-section">
                <span className="section-label">Conversations:</span>
                <div className="conversations-container">
                    {conversations.map(c => {
                        const isActive = c.id === activeConversationId;
                        const label = c.origin?.type === 'version' ? `from ${c.origin.sourceId}` :
                                     c.origin?.type === 'branch' ? '↳ branch' : 'new';
                        return (
                            <div 
                                key={c.id}
                                className={`conversation-pill ${isActive ? 'active' : ''}`}
                                onClick={() => !isActive && switchConversation(c.id)}
                            >
                                <span className="conversation-pill-label">
                                    {label} ({c.messages?.filter(m => m.role !== 'system').length || 0})
                                </span>
                                {isActive && <span className="conversation-pill-active">•</span>}
                                <button 
                                    className="conversation-pill-delete"
                                    onClick={e => { e.stopPropagation(); deleteConversation(c.id); }}
                                >×</button>
                            </div>
                        );
                    })}
                    <button className="conversation-pill-new" onClick={newConversation} title="New conversation">+</button>
                </div>
            </div>
        </div>
    );
}
