/**
 * Settings Drawer Component - configuration panel
 */
import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { getApiKey, saveApiKey } from '../utils';

export function SettingsDrawer() {
    const { settingsOpen, setSettingsOpen, config, setConfig } = useApp();
    const [apiKey, setApiKeyState] = useState('');

    useEffect(() => {
        const service = config.service === 'local' ? 'ollama' : config.service;
        setApiKeyState(getApiKey(service));
    }, [config.service]);

    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleApiKeyChange = (e) => {
        const value = e.target.value;
        setApiKeyState(value);
        const service = config.service === 'local' ? 'ollama' : config.service;
        saveApiKey(service, value);
    };

    if (!settingsOpen) return null;

    return (
        <>
            <div className="settings-drawer-backdrop" onClick={() => setSettingsOpen(false)} />
            <aside className="settings-drawer open">
                <div className="settings-drawer-header">
                    <div>
                        <h2>Playground settings</h2>
                        <p>Configure models and response options.</p>
                    </div>
                    <button className="icon-button" onClick={() => setSettingsOpen(false)}>×</button>
                </div>
                <div className="settings-drawer-body">
                    <div className="config-panel">
                        <section className="config-section">
                            <div className="config-section-header"><h2>Model & service</h2></div>
                            <div className="config-field">
                                <label>Service</label>
                                <select value={config.service} onChange={e => updateConfig('service', e.target.value)}>
                                    <option value="">Select service</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="anthropic">Anthropic</option>
                                    <option value="gemini">Google</option>
                                    <option value="local">Local / Other</option>
                                </select>
                            </div>
                            <div className="config-field">
                                <label>Model</label>
                                <input
                                    type="text"
                                    value={config.model}
                                    onChange={e => updateConfig('model', e.target.value)}
                                    placeholder="e.g. gpt-4o-mini"
                                />
                            </div>
                            <div className="config-field">
                                <label>API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={handleApiKeyChange}
                                    placeholder="Enter API key (optional)"
                                />
                                <small className="config-hint">Stored locally in your browser.</small>
                            </div>
                            <details className="config-advanced">
                                <summary>Advanced options</summary>
                                <div className="config-advanced-grid">
                                    <div className="config-field">
                                        <label>Temperature</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="2"
                                            value={config.temperature}
                                            onChange={e => updateConfig('temperature', e.target.value)}
                                            placeholder="1.0"
                                        />
                                    </div>
                                    <div className="config-field">
                                        <label>Max tokens</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={config.maxTokens}
                                            onChange={e => updateConfig('maxTokens', e.target.value)}
                                            placeholder="e.g. 512"
                                        />
                                    </div>
                                    <div className="config-field">
                                        <label>top_p</label>
                                        <input
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="1"
                                            value={config.topP}
                                            onChange={e => updateConfig('topP', e.target.value)}
                                            placeholder="1.0"
                                        />
                                    </div>
                                </div>
                            </details>
                        </section>
                        <section className="config-section">
                            <div className="config-section-header"><h2>Response mode</h2></div>
                            <div className="mode-toggle">
                                <button
                                    className={`mode-toggle-button ${config.responseMode === 'text' ? 'mode-toggle-button-active' : ''}`}
                                    onClick={() => updateConfig('responseMode', 'text')}
                                >Text</button>
                                <button
                                    className={`mode-toggle-button ${config.responseMode === 'json' ? 'mode-toggle-button-active' : ''}`}
                                    onClick={() => updateConfig('responseMode', 'json')}
                                >JSON</button>
                            </div>
                        </section>
                    </div>
                </div>
            </aside>
        </>
    );
}
