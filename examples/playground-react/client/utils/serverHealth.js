import { HEALTH_API_URL } from './constants.js';

const HEALTH_PROBE_TIMEOUT_MS = 2000;

/**
 * Probes the playground /api/health endpoint.
 * @returns {'online' | 'offline' | 'unhealthy'}
 */
export async function checkServerHealth() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS);
        const response = await fetch(HEALTH_API_URL, {
            method: 'GET',
            signal: controller.signal,
            cache: 'no-store',
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return 'unhealthy';
        }

        const data = await response.json();
        return data?.status === 'ok' ? 'online' : 'unhealthy';
    } catch {
        return 'offline';
    }
}

/**
 * True when fetch never reached the server (browser/network layer failure).
 */
export function isNetworkFetchError(error) {
    if (!error) return false;
    if (error instanceof TypeError) return true;
    const message = error.message || '';
    return message === 'Failed to fetch'
        || message.includes('NetworkError')
        || message.includes('Load failed');
}
