import { FaTimes, FaInfoCircle } from 'react-icons/fa';
import { useApp } from '../context/AppContext';

export function BackendActivityPanel() {
    const { messages, selectedActivityMessageId, isBackendPanelOpen, setIsBackendPanelOpen } = useApp();

    if (!isBackendPanelOpen) {
        return null;
    }

    const selectedMessage = messages.find(m => m.id === selectedActivityMessageId);
    const backendActivity = selectedMessage?.metadata?.operation || null;

    if (!backendActivity) {
        return null;
    }

    const { timing, retries, rateLimiting, service, cache, events, config, http, usage } = backendActivity;

    const totalRetries = retries?.length || 0;
    const totalTimeMs = timing?.totalTimeMs ?? null;
    const httpTimeMs = timing?.httpRequestMs ?? null;
    const rateLimitWaitMs = timing?.rateLimitWaitMs ?? rateLimiting?.totalWaitMs ?? null;

    return (
        <>
            <div
                className="backend-activity-backdrop"
                onClick={() => setIsBackendPanelOpen(false)}
                aria-hidden="true"
            />
            <aside className="backend-activity-panel" role="complementary" aria-label="Backend activity">
                        <div className="backend-activity-header">
                            <div>
                                <h2>Backend activity</h2>
                                <p>What ResilientLLM did for the last call.</p>
                            </div>
                            <button
                                type="button"
                                className="icon-button"
                                onClick={() => setIsBackendPanelOpen(false)}
                                aria-label="Close backend activity"
                            >
                                <FaTimes />
                            </button>
                        </div>

                        <div className="backend-activity-body">
                            <section className="backend-activity-summary">
                                <div className="backend-activity-summary-grid">
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Service</span>
                                        <span className="backend-activity-summary-value">
                                            {service?.final || config?.aiService || '—'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Model</span>
                                        <span className="backend-activity-summary-value">
                                            {config?.model || '—'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Total time</span>
                                        <span className="backend-activity-summary-value">
                                            {totalTimeMs != null ? `${totalTimeMs} ms` : '—'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">HTTP time</span>
                                        <span className="backend-activity-summary-value">
                                            {httpTimeMs != null ? `${httpTimeMs} ms` : '—'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Rate-limit wait</span>
                                        <span className="backend-activity-summary-value">
                                            {rateLimitWaitMs ? `${rateLimitWaitMs} ms` : '0 ms'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Retries</span>
                                        <span className="backend-activity-summary-value">
                                            {totalRetries}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">Cache</span>
                                        <span className="backend-activity-summary-value">
                                            {cache && 'enabled' in cache && cache.enabled === false
                                                ? 'Off'
                                                : config && 'enableCache' in config && config.enableCache === false
                                                    ? 'Off'
                                                    : cache?.hit
                                                        ? 'Hit'
                                                        : cache
                                                            ? 'Miss'
                                                            : '—'}
                                        </span>
                                    </div>
                                    <div className="backend-activity-summary-card">
                                        <span className="backend-activity-summary-label">HTTP status</span>
                                        <span className="backend-activity-summary-value">
                                            {http?.statusCode ?? '—'}
                                        </span>
                                    </div>
                                    {usage && typeof usage === 'object' && (
                                        <div className="backend-activity-summary-card backend-activity-tokens-card">
                                            <span className="backend-activity-summary-label">Tokens</span>
                                            <div className="backend-activity-tokens-value">
                                                <span className="backend-activity-tokens-total">
                                                    {usage.total_tokens != null ? usage.total_tokens : '—'}
                                                </span>
                                                {(usage.prompt_tokens != null || usage.completion_tokens != null) && (
                                                    <span className="backend-activity-tokens-breakdown">
                                                        {[
                                                            usage.prompt_tokens != null && `${usage.prompt_tokens} prompt`,
                                                            usage.completion_tokens != null && `${usage.completion_tokens} output`
                                                        ].filter(Boolean).join(' · ')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="backend-activity-timeline">
                                <div className="backend-activity-section-header">
                                    <h3>Timeline</h3>
                                    <span className="backend-activity-section-subtitle">
                                        {Array.isArray(events) && events.length > 0
                                            ? `${events.length} event${events.length === 1 ? '' : 's'}`
                                            : 'No events recorded'}
                                    </span>
                                </div>
                                <div className="backend-activity-timeline-list">
                                    {Array.isArray(events) && events.length > 0 ? (
                                        events.map((event, index) => {
                                            const type = (event?.type || event?.level || 'info').toLowerCase();
                                            let badgeClass = 'backend-activity-badge-info';
                                            if (type.includes('success')) badgeClass = 'backend-activity-badge-success';
                                            else if (type.includes('retry') || type.includes('warn')) badgeClass = 'backend-activity-badge-retry';
                                            else if (type.includes('error') || type.includes('fail')) badgeClass = 'backend-activity-badge-error';

                                            const label = event?.label || event?.message || event?.type || 'Event';
                                            const timestamp = event?.timestamp || event?.time;

                                            return (
                                                <div key={index} className="backend-activity-timeline-item">
                                                    <div className={`backend-activity-timeline-dot ${badgeClass}`} />
                                                    <div className="backend-activity-timeline-content">
                                                        <div className="backend-activity-timeline-row">
                                                            <span className={`backend-activity-badge ${badgeClass}`}>
                                                                {type}
                                                            </span>
                                                            {timestamp && (
                                                                <span className="backend-activity-timestamp">
                                                                    {timestamp}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="backend-activity-timeline-label">
                                                            {label}
                                                        </div>
                                                        {event?.details && (
                                                            <pre className="backend-activity-json">
                                                                {JSON.stringify(event.details, null, 2)}
                                                            </pre>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="backend-activity-empty">
                                            <FaInfoCircle style={{ marginRight: 6 }} />
                                            No detailed events were captured for this request.
                                        </div>
                                    )}
                                </div>
                            </section>

                            <section className="backend-activity-raw">
                                <details>
                                    <summary>Raw metadata (JSON)</summary>
                                    <pre className="backend-activity-json">
                                        {JSON.stringify(backendActivity, null, 2)}
                                    </pre>
                                </details>
                            </section>
                        </div>
                    </aside>
        </>
    );
}

