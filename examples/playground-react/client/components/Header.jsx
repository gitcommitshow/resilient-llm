/**
 * Header Component - app title and status
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context';
import { FaCode, FaChevronRight, FaShieldAlt, FaBrain, FaClock } from 'react-icons/fa';
import { getProviderDisplayName } from '../utils/providerUtils';

export function StatusBar() {
    const { config, configSaved, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    const serviceName = getProviderDisplayName(config.service) || '—';
    
    useEffect(() => {
        if (configSaved && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSaved]);
    
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
    const { config, configSaved, setSettingsOpen, setSettingsDefaultSection } = useApp();
    const statusBarRef = useRef(null);
    
    useEffect(() => {
        if (configSaved && statusBarRef.current) {
            statusBarRef.current.classList.add('saved');
            const timer = setTimeout(() => {
                if (statusBarRef.current) {
                    statusBarRef.current.classList.remove('saved');
                }
            }, 1200);
            return () => clearTimeout(timer);
        }
    }, [configSaved]);
    
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

export function Header() {
    const { messages, selectedActivityMessageId, setSelectedActivityMessageId, isBackendPanelOpen, setIsBackendPanelOpen } = useApp();
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
                    ResilientLLM Playground
                </h1>
                <p>Experiment with prompts, models, and resilience</p>
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
            </div>
        </div>
    );
}
