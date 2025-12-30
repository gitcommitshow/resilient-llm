/**
 * Header Component - app title and status
 */
import { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { FaCode, FaChevronRight } from 'react-icons/fa';

export function StatusBar() {
    const { config, configSaved, setSettingsOpen } = useApp();
    const statusBarRef = useRef(null);
    const serviceName = config.service === 'local' ? 'Local' : 
                      config.service === 'openai' ? 'OpenAI' :
                      config.service === 'anthropic' ? 'Anthropic' :
                      config.service === 'gemini' ? 'Google' : '—';
    
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
    
    return (
        <div 
            ref={statusBarRef} 
            className="status-bar"
            onClick={() => setSettingsOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSettingsOpen(true);
                }
            }}
            title="Configure LLM settings"
            aria-label="Open settings"
        >
            <span className="status-label">Service:</span>
            <span>{serviceName}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Model:</span>
            <span>{config.model || '—'}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Mode:</span>
            <span>{config.responseMode === 'json' ? 'JSON' : 'Text'}</span>
            <span className="status-bar-expand-icon"><FaChevronRight /></span>
        </div>
    );
}

export function Header() {
    return (
        <div className="playground-header">
            <div>
                <h1>
                    <FaCode style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                    ResilientLLM Playground
                </h1>
                <p>Experiment with prompts, models, and resilience</p>
            </div>
        </div>
    );
}
