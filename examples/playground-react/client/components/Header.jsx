/**
 * Header Component - app title and status
 */
import { useApp } from '../context/AppContext';

export function StatusBar() {
    const { config } = useApp();
    const serviceName = config.service === 'local' ? 'Local' : 
                      config.service === 'openai' ? 'OpenAI' :
                      config.service === 'anthropic' ? 'Anthropic' :
                      config.service === 'gemini' ? 'Google' : '—';
    
    return (
        <div className="status-bar">
            <span className="status-label">Service:</span>
            <span>{serviceName}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Model:</span>
            <span>{config.model || '—'}</span>
            <span className="status-separator">•</span>
            <span className="status-label">Mode:</span>
            <span>{config.responseMode === 'json' ? 'JSON' : 'Text'}</span>
        </div>
    );
}

export function Header() {
    const { setSettingsOpen } = useApp();
    
    return (
        <div className="playground-header">
            <div>
                <h1>ResilientLLM Playground</h1>
                <p>Experiment with prompts, models, and resilience</p>
            </div>
            <div className="header-right">
                <StatusBar />
                <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Settings">☰</button>
            </div>
        </div>
    );
}
