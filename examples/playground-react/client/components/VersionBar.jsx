/**
 * Version Bar Component - displays versions and conversations
 */
import { useApp } from '../context/AppContext';
import { formatRelativeTime } from '../utils';
import { FaStar, FaRegStar, FaTimes, FaPlus } from 'react-icons/fa';

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
    
    // Check if any conversation has messages (including system prompts)
    const hasConversationsWithMessages = conversations.some(c => (c.messages || []).length > 0);

    return (
        <div className="versions-drafts-bar">
            {versions.length > 0 && (
                <div className="versions-section">
                    <span className="section-label">Versions:</span>
                    <div className="versions-container">
                        {versions.map(v => {
                            const isBest = bestVersionId === v.id;
                            const isExplicitBest = currentPrompt?.bestVersionId === v.id;
                            const msgCount = v.messages?.filter(m => m.role !== 'system').length || 0;
                            
                            return (
                                <button
                                    key={v.id} 
                                    className={`version-pill ${isBest ? 'best' : ''}`}
                                    onClick={() => loadVersion(v.id)}
                                    tabIndex={2}
                                    title={v.notes || `Click to load • Created ${formatRelativeTime(v.createdAt)}`}
                                >
                                    <span 
                                        className={`version-pill-best ${isBest ? 'active' : ''}`}
                                        onClick={e => { 
                                            e.stopPropagation(); 
                                            toggleBestVersion(v.id); 
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                toggleBestVersion(v.id);
                                            }
                                        }}
                                        tabIndex={-1}
                                        role="button"
                                        title={isBest 
                                            ? (isExplicitBest ? 'Click to unset as best (use latest)' : 'Best version (latest)')
                                            : 'Mark as best version'}
                                    >
                                        {isBest ? <FaStar /> : <FaRegStar />}
                                    </span>
                                    <span className="version-pill-label">
                                        {v.id} ({msgCount})
                                        {v.parentVersionId && (
                                            <span className="version-pill-lineage"> ← {v.parentVersionId}</span>
                                        )}
                                    </span>
                                    <span 
                                        className="version-pill-delete"
                                        onClick={e => { e.stopPropagation(); deleteVersion(v.id); }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                deleteVersion(v.id);
                                            }
                                        }}
                                        tabIndex={-1}
                                        role="button"
                                        title="Delete version"
                                    >
                                        <FaTimes />
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
            {hasConversationsWithMessages && (
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
                                <button
                                    key={c.id}
                                    className={`conversation-pill ${isActive ? 'active' : ''} ${isBranch ? 'branch' : ''} ${isFromBestVersion ? 'from-best' : ''}`}
                                    onClick={(e) => {
                                        if (!isActive) {
                                            e.preventDefault();
                                            switchConversation(c.id);
                                        }
                                    }}
                                    tabIndex={3}
                                    title={tooltip}
                                >
                                    {isFromBestVersion && (
                                        <span className="conversation-pill-best" title="From best version">
                                            <FaStar />
                                        </span>
                                    )}
                                    <span className="conversation-pill-label">
                                        {label} ({msgCount})
                                    </span>
                                    {isActive && <span className="conversation-pill-active">•</span>}
                                    <span 
                                        className="conversation-pill-delete"
                                        onClick={(e) => { 
                                            e.preventDefault();
                                            e.stopPropagation();
                                            deleteConversation(c.id);
                                        }}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                deleteConversation(c.id);
                                            }
                                        }}
                                        tabIndex={-1}
                                        role="button"
                                        title="Delete conversation"
                                    >
                                        <FaTimes />
                                    </span>
                                </button>
                            );
                        })}
                        <button className="conversation-pill-new" onClick={newConversation} tabIndex={3} title="New conversation">
                            <FaPlus />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
