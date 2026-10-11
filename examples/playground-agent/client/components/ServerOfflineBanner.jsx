/**
 * Alert shown when the backend is unreachable or unhealthy.
 */
import { FaExclamationTriangle, FaSyncAlt } from 'react-icons/fa';
import { useApp } from '../context';

export function ServerOfflineBanner() {
    const { serverHealth, refreshServerHealth } = useApp();

    if (serverHealth === 'checking' || serverHealth === 'online') {
        return null;
    }

    const isOffline = serverHealth === 'offline';

    return (
        <div
            className={`server-health-banner ${isOffline ? 'server-health-banner-offline' : 'server-health-banner-unhealthy'}`}
            role="alert"
        >
            <FaExclamationTriangle aria-hidden="true" />
            <div className="server-health-banner-content">
                <strong>{isOffline ? 'Backend server is offline' : 'Backend API health check failed'}</strong>
                <p>
                    {isOffline
                        ? 'Chat requests will fail until the backend is running. If you opened only the frontend, start both the backend and frontend.'
                        : 'The backend API responded but did not report a healthy status. It may still be starting or misconfigured.'}
                </p>
            </div>
            <button
                type="button"
                className="server-health-banner-retry"
                onClick={() => refreshServerHealth()}
                title="Check server status again"
            >
                <FaSyncAlt aria-hidden="true" />
                Retry
            </button>
        </div>
    );
}
