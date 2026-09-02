import { useState, useEffect, useCallback } from 'react';
import { checkServerHealth, isNetworkFetchError } from '../utils/serverHealth.js';

/**
 * Tracks playground server reachability without polling.
 * Probes /api/health on mount and when the tab regains focus; updates on API outcomes.
 */
export function useServerHealth() {
    const [serverHealth, setServerHealth] = useState('checking');

    const refreshServerHealth = useCallback(async () => {
        const status = await checkServerHealth();
        setServerHealth(status);
    }, []);

    const reportApiSuccess = useCallback(() => {
        setServerHealth('online');
    }, []);

    const reportApiFailure = useCallback((error) => {
        if (isNetworkFetchError(error)) {
            setServerHealth('offline');
            return;
        }
        // Server responded or failed for a non-network reason — still reachable.
        setServerHealth('online');
    }, []);

    useEffect(() => {
        refreshServerHealth();

        const handleFocus = () => refreshServerHealth();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [refreshServerHealth]);

    return {
        serverHealth,
        refreshServerHealth,
        reportApiSuccess,
        reportApiFailure,
    };
}
