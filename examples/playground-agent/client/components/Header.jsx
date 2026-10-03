/**
 * Header Component - app title and status
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context';
import { FaCode, FaChevronRight, FaShieldAlt, FaBrain, FaClock, FaMoon, FaSun, FaSearch, FaFileAlt } from 'react-icons/fa';
import { getProviderDisplayName } from '../utils/providerUtils';
import { searchProviderLabel } from '../utils/constants';

export function StatusBar() {
    const { config, configSavedModels, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    const serviceName = getProviderDisplayName(config.service) || '—';
    
    useEffect(() => {
        if (configSavedModels && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSavedModels]);
    
    const handleClick = () => {
        setSettingsDefaultSection('models');
        setSettingsOpen(true);
    };
    
    return (
        <div 
            ref={statusBarRef} 
            className="status-bar"
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
            title="Configure LLM settings"
            aria-label="Open settings"
        >
            <FaBrain style={{ marginRight: '4px', fontSize: '0.9em' }} />
            <span className="status-label">Service:</span>
            <span>{serviceName}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Model:</span>
            <span>{config.model || '—'}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Mode:</span>
            <span>{config.responseFormat === 'json' ? 'JSON' : 'Text'}</span>
            <span className="status-bar-expand-icon"><FaChevronRight /></span>
        </div>
    );
}

export function ResilienceStatusBar() {
    const { config, configSavedResilience, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    
    useEffect(() => {
        if (configSavedResilience && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSavedResilience]);
    
    const retries = config.retries || '3';
    const timeout = config.timeout || '60000';
    const timeoutSeconds = Math.round(parseInt(timeout, 10) / 1000) || 60;
    const requestsPerMin = config.requestsPerMinute || '60';
    
    const handleClick = () => {
        setSettingsDefaultSection('resilience');
        setSettingsOpen(true);
    };
    
    return (
        <div 
            ref={statusBarRef} 
            className="status-bar"
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
            title="Configure resilience settings"
            aria-label="Open settings"
        >
            <FaShieldAlt style={{ marginRight: '4px', fontSize: '0.9em' }} />
            <span className="status-label">Retries:</span>
            <span>{retries}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Timeout:</span>
            <span>{timeoutSeconds}s</span>
            <span className="status-separator">•</span>
            <span className="status-label">Rate:</span>
            <span>{requestsPerMin}/min</span>
            <span className="status-bar-expand-icon"><FaChevronRight /></span>
        </div>
    );
}

export function ReadPageStatusBar() {
    const { config, configSavedTools, setReadPageEnabled, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    const enabled = config.readPageEnabled !== false;

    useEffect(() => {
        if (configSavedTools && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSavedTools]);

    return (
        <div
            ref={statusBarRef}
            className={`status-bar tools-status-bar ${enabled ? 'tools-status-on' : 'tools-status-off'}`}
            title="read_page tool"
        >
            <button
                type="button"
                className="tools-status-label"
                onClick={() => {
                    setSettingsDefaultSection('tools');
                    setSettingsOpen(true);
                }}
                aria-label="Open tool settings"
            >
                <FaFileAlt style={{ marginRight: '4px', fontSize: '0.9em' }} />
                <span className="status-label">Tool:</span>
                <span>read_page</span>
            </button>
            <button
                type="button"
                className="tools-status-toggle"
                aria-pressed={enabled}
                aria-label={enabled ? 'Disable read_page' : 'Enable read_page'}
                title={enabled ? 'Disable read_page' : 'Enable read_page'}
                onClick={() => setReadPageEnabled(!enabled)}
            >
                {enabled ? 'On' : 'Off'}
            </button>
        </div>
    );
}

export function ToolsStatusBar() {
    const { config, configSavedTools, setWebSearchEnabled, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    const enabled = config.webSearchEnabled !== false;

    useEffect(() => {
        if (configSavedTools && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSavedTools]);

    const openToolsSettings = () => {
        setSettingsDefaultSection('tools');
        setSettingsOpen(true);
    };

    return (
        <div
            ref={statusBarRef}
            className={`status-bar tools-status-bar ${enabled ? 'tools-status-on' : 'tools-status-off'}`}
            title={`web_search via ${searchProviderLabel(config.searchProvider)}`}
        >
            <button
                type="button"
                className="tools-status-label"
                onClick={openToolsSettings}
                aria-label="Open tool settings"
            >
                <FaSearch style={{ marginRight: '4px', fontSize: '0.9em' }} />
                <span className="status-label">Tool:</span>
                <span>web_search</span>
                <span className="status-separator">•</span>
                <span>{searchProviderLabel(config.searchProvider)}</span>
            </button>
            <button
                type="button"
                className="tools-status-toggle"
                aria-pressed={enabled}
                aria-label={enabled ? 'Disable web_search' : 'Enable web_search'}
                title={enabled ? 'Disable web_search' : 'Enable web_search'}
                onClick={() => setWebSearchEnabled(!enabled)}
            >
                {enabled ? 'On' : 'Off'}
            </button>
        </div>
    );
}

export function Header() {
    const { messages, selectedActivityMessageId, setSelectedActivityMessageId, isBackendPanelOpen, setIsBackendPanelOpen, theme, setTheme } = useApp();
    const activityMessages = messages.filter(m => m.role === 'assistant' && m.metadata && m.metadata.operation);
    const hasActivity = activityMessages.length > 0;

    const handleClick = () => {
        if (!hasActivity) return;
        if (!selectedActivityMessageId && activityMessages.length > 0) {
            const last = activityMessages[activityMessages.length - 1];
            setSelectedActivityMessageId(last.id);
        }
        setIsBackendPanelOpen(!isBackendPanelOpen);
    };

    return (
        <div className="playground-header">
            <div>
                <h1>
                    <FaCode style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    ResilientLLM Agent
                </h1>
                <p>Build an agent with prompts, models, and resilience</p>
            </div>
            <div className="playground-header-actions">
                <button
                    type="button"
                    className="backend-activity-header-button"
                    onClick={handleClick}
                    disabled={!hasActivity}
                    title={hasActivity ? 'Show backend activity for the last request' : 'Send a message to see backend activity'}
                >
                    <FaClock style={{ marginRight: 6 }} />
                    Backend activity
                </button>
                <button
                    type="button"
                    className="theme-toggle-header-button"
                    onClick={() => setTheme()}
                    title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                    aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                    {theme === 'light' ? <FaMoon /> : <FaSun />}
                </button>
            </div>
        </div>
    );
}
