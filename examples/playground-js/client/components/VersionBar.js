/**
 * VersionBar - Displays versions and conversations for a prompt
 */
import { Version } from '../models/Version.js';
import { Conversation } from '../models/Conversation.js';
import { Prompt } from '../models/Prompt.js';
import { formatRelativeTime } from '../utils/datetime.js';
import { createElement } from '../utils/dom.js';

export class VersionBar {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.versionsContainer
     * @param {HTMLElement} options.conversationsContainer
     * @param {string} options.promptId
     * @param {string} [options.activeConversationId]
     * @param {Function} [options.onLoadVersion] - (versionId) => void
     * @param {Function} [options.onSwitchConversation] - (conversationId) => void
     * @param {Function} [options.onDeleteVersion] - (versionId) => void
     * @param {Function} [options.onDeleteConversation] - (conversationId) => void
     * @param {Function} [options.onNewConversation] - () => void
     * @param {Function} [options.onToggleBestVersion] - (versionId, isBest, isExplicitBest) => void
     */
    constructor({
        versionsContainer,
        conversationsContainer,
        promptId,
        activeConversationId,
        onLoadVersion,
        onSwitchConversation,
        onDeleteVersion,
        onDeleteConversation,
        onNewConversation,
        onToggleBestVersion
    }) {
        this.versionsContainer = versionsContainer;
        this.conversationsContainer = conversationsContainer;
        this.promptId = promptId;
        this.activeConversationId = activeConversationId;
        
        this.onLoadVersion = onLoadVersion;
        this.onSwitchConversation = onSwitchConversation;
        this.onDeleteVersion = onDeleteVersion;
        this.onDeleteConversation = onDeleteConversation;
        this.onNewConversation = onNewConversation;
        this.onToggleBestVersion = onToggleBestVersion;
    }

    /**
     * Set the prompt ID
     * @param {string} promptId
     */
    setPromptId(promptId) {
        this.promptId = promptId;
    }

    /**
     * Set the active conversation ID
     * @param {string} conversationId
     */
    setActiveConversation(conversationId) {
        this.activeConversationId = conversationId;
    }

    /**
     * Refresh both versions and conversations displays
     */
    refresh() {
        this.refreshVersions();
        this.refreshConversations();
    }

    /**
     * Refresh versions display
     */
    refreshVersions() {
        if (!this.versionsContainer) return;
        this.versionsContainer.innerHTML = '';

        const prompt = this.promptId ? Prompt.get(this.promptId) : null;
        const versions = this.promptId ? Version.listByPrompt(this.promptId) : [];

        if (!prompt || versions.length === 0) {
            const emptyMsg = createElement('span', 'versions-empty');
            emptyMsg.textContent = 'No saved versions';
            this.versionsContainer.appendChild(emptyMsg);
            return;
        }

        versions.forEach((version) => {
            const isBest = version.isBestVersion();
            const isExplicitBest = prompt.bestVersionId === version.id;
            
            const versionItem = createElement('div', `version-pill ${isBest ? 'best' : ''}`);
            versionItem.title = version.notes || `Click to load • Created ${formatRelativeTime(version.createdAt)}`;
            
            // Clicking the pill loads the version
            versionItem.onclick = () => {
                if (this.onLoadVersion) this.onLoadVersion(version.id);
            };
            
            // Best version star button
            const bestBtn = createElement('button', `version-pill-best ${isBest ? 'active' : ''}`);
            bestBtn.innerHTML = isBest ? '★' : '☆';
            bestBtn.title = isBest 
                ? (isExplicitBest ? 'Click to unset as best (use latest)' : 'Best version (latest)')
                : 'Mark as best version';
            bestBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.onToggleBestVersion) {
                    this.onToggleBestVersion(version.id, isBest, isExplicitBest);
                } else {
                    this._toggleBestVersion(version.id, prompt.id, isBest, isExplicitBest);
                }
            };
            versionItem.appendChild(bestBtn);
            
            // Label with message count
            const label = createElement('span', 'version-pill-label');
            const msgCount = version.getMessageCount();
            label.textContent = `${version.id} (${msgCount})`;
            
            // Show lineage if has parent
            if (version.parentVersionId) {
                const lineage = createElement('span', 'version-pill-lineage');
                lineage.textContent = ` ← ${version.parentVersionId}`;
                label.appendChild(lineage);
            }
            
            versionItem.appendChild(label);
            
            // Delete button
            const deleteBtn = createElement('button', 'version-pill-delete');
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete version';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.onDeleteVersion) this.onDeleteVersion(version.id);
            };
            versionItem.appendChild(deleteBtn);
            
            this.versionsContainer.appendChild(versionItem);
        });
    }

    /**
     * Refresh conversations display
     */
    refreshConversations() {
        if (!this.conversationsContainer) return;
        this.conversationsContainer.innerHTML = '';

        if (!this.promptId) return;

        const conversations = Conversation.listByPrompt(this.promptId);
        const bestVersion = Version.getBestVersion(this.promptId);
        const bestVersionId = bestVersion ? bestVersion.id : null;

        conversations.forEach((conversation) => {
            const isActive = conversation.id === this.activeConversationId;
            const originInfo = conversation.getOriginInfo();
            const isBranch = conversation.origin?.type === 'branch';
            const isFromBestVersion = conversation.origin?.type === 'version' && 
                                       conversation.origin?.sourceId === bestVersionId;
            
            const convItem = createElement('div', 
                `conversation-pill ${isActive ? 'active' : ''} ${isBranch ? 'branch' : ''} ${isFromBestVersion ? 'from-best' : ''}`
            );
            convItem.title = isFromBestVersion 
                ? `${originInfo.tooltip} (from best version)` 
                : originInfo.tooltip;
            
            convItem.onclick = () => {
                if (!isActive && this.onSwitchConversation) {
                    this.onSwitchConversation(conversation.id);
                }
            };
            
            // Star indicator for conversations from best version
            if (isFromBestVersion) {
                const bestIndicator = createElement('span', 'conversation-pill-best');
                bestIndicator.textContent = '★';
                bestIndicator.title = 'From best version';
                convItem.appendChild(bestIndicator);
            }
            
            // Label with message count
            const label = createElement('span', 'conversation-pill-label');
            const msgCount = conversation.getMessageCount();
            label.textContent = `${originInfo.label} (${msgCount})`;
            convItem.appendChild(label);
            
            // Active indicator
            if (isActive) {
                const activeIndicator = createElement('span', 'conversation-pill-active');
                activeIndicator.textContent = '•';
                convItem.appendChild(activeIndicator);
            }
            
            // Delete button
            const deleteBtn = createElement('button', 'conversation-pill-delete');
            deleteBtn.textContent = '×';
            deleteBtn.title = 'Delete conversation';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (this.onDeleteConversation) this.onDeleteConversation(conversation.id);
            };
            convItem.appendChild(deleteBtn);
            
            this.conversationsContainer.appendChild(convItem);
        });

        // Add "New Conversation" button
        const newConvBtn = createElement('button', 'conversation-pill-new');
        newConvBtn.textContent = '+';
        newConvBtn.title = 'Create new conversation';
        newConvBtn.onclick = () => {
            if (this.onNewConversation) this.onNewConversation();
        };
        this.conversationsContainer.appendChild(newConvBtn);
    }

    /**
     * Toggle best version status (internal handler)
     * @private
     */
    _toggleBestVersion(versionId, promptId, isBest, isExplicitBest) {
        const prompt = Prompt.get(promptId);
        if (!prompt) return;

        if (isBest && isExplicitBest) {
            // Unset explicit best, go back to "latest is best"
            prompt.setBestVersion(null);
        } else if (!isBest) {
            // Mark this version as best
            prompt.setBestVersion(versionId);
        } else if (isBest && !isExplicitBest) {
            // If isBest but not explicit (it's latest), clicking sets it as explicit best
            prompt.setBestVersion(versionId);
        }
        
        this.refresh();
    }

    /**
     * Show save version modal
     * @param {Function} onSave - (notes: string) => void
     */
    showSaveVersionModal(onSave) {
        // Remove existing modal if any
        const existing = document.getElementById('saveVersionModal');
        if (existing) existing.remove();

        const modal = createElement('div', 'modal');
        modal.id = 'saveVersionModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Save as Version</h3>
                </div>
                <div class="modal-body">
                    <p class="modal-description">Save the current conversation as an immutable version.</p>
                    <label>Notes (optional):</label>
                    <input type="text" id="versionNotes" placeholder="e.g., Good baseline" autofocus />
                </div>
                <div class="modal-footer">
                    <button class="secondary-button" id="cancelVersionBtn">Cancel</button>
                    <button class="primary-button" id="confirmVersionBtn">Save Version</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        setTimeout(() => {
            const notesInput = document.getElementById('versionNotes');
            if (notesInput) notesInput.focus();
        }, 100);

        const cancelBtn = document.getElementById('cancelVersionBtn');
        const confirmBtn = document.getElementById('confirmVersionBtn');
        const notesInput = document.getElementById('versionNotes');

        cancelBtn.onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };

        confirmBtn.onclick = () => {
            const notes = notesInput.value.trim();
            if (onSave) onSave(notes);
            modal.remove();
        };

        notesInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmBtn.click();
            }
        };
    }
}

