/**
 * Application constants and configuration
 */
export const STORAGE_KEY = 'resilientllm_playground_v3';
export const THEME_STORAGE_KEY = 'resilientllm_playground_theme';
export const API_KEYS_KEY = 'resilientllm_api_keys';
export const API_URL = '/api/chat';
export const TOOL_DECISION_API_URL = '/api/tool-decision';
export const ABORT_API_URL = '/api/abort';
export const HEALTH_API_URL = '/api/health';
export const LIBRARY_INFO_URL = '/api/library-info';
export const MODELS_API_URL = '/api/models';

/** Web search backends the agent playground can run. */
export const SEARCH_PROVIDERS = [
    { id: 'duckduckgo', label: 'DuckDuckGo' },
    { id: 'tavily', label: 'Tavily' }
];

/** Display name for a stored search provider id. Unknown ids stay on DuckDuckGo. */
export function searchProviderLabel(id) {
    return SEARCH_PROVIDERS.find((provider) => provider.id === id)?.label || 'DuckDuckGo';
}
