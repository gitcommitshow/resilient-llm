/**
 * Version Bar Component - displays versions and conversations
 */
import { useApp } from '../context/AppContext';
import { formatRelativeTime } from '../utils';

export function VersionBar() {
    const { 
        currentPromptId, activeConversationId, 
        getVersions, getConversations, getBestVersion, toggleBestVersion,
        loadVersion, deleteVersion, 
        switchConversation, deleteConversation, newConversation,
        currentPrompt
    } = useApp();

    const versions = currentPromptId ? getVersions(currentPromptId) : [];
    const conversations = currentPromptId ? getConversations(currentPromptId) : [];
    const bestVersion = currentPromptId ? getBestVersion(currentPromptId) : null;
    const bestVersionId = bestVersion?.id || null;

    return (
        <div className="versions-drafts-bar">
            <div className="versions-section">
                <span className="section-label">Versions:</span>
                <div className="versions-container">
                    {versions.length === 0 ? (
                        <span className="versions-empty">No saved versions</span>
                    ) : versions.map(v => {
                        const isBest = bestVersionId === v.id;
                        const isExplicitBest = currentPrompt?.bestVersionId === v.id;
                        const msgCount = v.messages?.filter(m => m.role !== 'system').length || 0;
                        
                        return (
                            <div 
                                key={v.id} 
                                className={`version-pill ${isBest ? 'best' : ''}`}
                                onClick={() => loadVersion(v.id)}
                                title={v.notes || `Click to load • Created ${formatRelativeTime(v.createdAt)}`}
                            >
                                <button 
                                    className={`version-pill-best ${isBest ? 'active' : ''}`}
                                    onClick={e => { 
                                        e.stopPropagation(); 
                                        toggleBestVersion(v.id); 
                                    }}
                                    title={isBest 
                                        ? (isExplicitBest ? 'Click to unset as best (use latest)' : 'Best version (latest)')
                                        : 'Mark as best version'}
                                >
                                    {isBest ? '★' : '☆'}
                                </button>
                                <span className="version-pill-label">
                                    {v.id} ({msgCount})
                                    {v.parentVersionId && (
                                        <span className="version-pill-lineage"> ← {v.parentVersionId}</span>
                                    )}
                                </span>
                                <button 
                                    className="version-pill-delete"
                                    onClick={e => { e.stopPropagation(); deleteVersion(v.id); }}
                                    title="Delete version"
                                >×</button>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="conversations-section">
                <span className="section-label">Conversations:</span>
                <div className="conversations-container">
                    {conversations.map(c => {
                        const isActive = c.id === activeConversationId;
                        const isBranch = c.origin?.type === 'branch';
                        const isFromBestVersion = c.origin?.type === 'version' && 
                                                   c.origin?.sourceId === bestVersionId;
                        const msgCount = c.messages?.filter(m => m.role !== 'system').length || 0;
                        
                        let label = 'new';
                        let tooltip = 'New conversation';
                        if (c.origin?.type === 'version') {
                            label = `from ${c.origin.sourceId}`;
                            tooltip = isFromBestVersion 
                                ? `From version ${c.origin.sourceId} (best version)` 
                                : `From version ${c.origin.sourceId}`;
                        } else if (isBranch) {
                            label = '↳ branch';
                            tooltip = 'Branched conversation';
                        }
                        
                        return (
                            <div 
                                key={c.id}
                                className={`conversation-pill ${isActive ? 'active' : ''} ${isBranch ? 'branch' : ''} ${isFromBestVersion ? 'from-best' : ''}`}
                                onClick={() => !isActive && switchConversation(c.id)}
                                title={tooltip}
                            >
                                {isFromBestVersion && (
                                    <span className="conversation-pill-best" title="From best version">★</span>
                                )}
                                <span className="conversation-pill-label">
                                    {label} ({msgCount})
                                </span>
                                {isActive && <span className="conversation-pill-active">•</span>}
                                <button 
                                    className="conversation-pill-delete"
                                    onClick={e => { e.stopPropagation(); deleteConversation(c.id); }}
                                    title="Delete conversation"
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
