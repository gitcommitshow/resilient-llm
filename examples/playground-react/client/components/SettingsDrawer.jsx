/**
 * Settings Drawer Component - configuration panel
 */
import { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { getApiKey, saveApiKey } from '../utils';
import { FaTimes, FaServer, FaKey, FaSlidersH, FaCode, FaFileAlt } from 'react-icons/fa';

export function SettingsDrawer() {
    const { settingsOpen, setSettingsOpen, config, setConfig, saveConversation } = useApp();
    const [apiKey, setApiKeyState] = useState('');
    const originalConfigRef = useRef(null);
    const originalApiKeyRef = useRef(null);
    const drawerRef = useRef(null);
    const previousActiveElementRef = useRef(null);

    // Load API key when service changes or drawer opens
    useEffect(() => {
        if (config.service) {
            const service = config.service === 'local' ? 'ollama' : config.service;
            setApiKeyState(getApiKey(service));
        } else {
            setApiKeyState('');
        }
    }, [config.service, settingsOpen]);

    // Save original config when drawer opens and manage focus
    useEffect(() => {
        if (settingsOpen) {
            originalConfigRef.current = { ...config };
            const service = config.service === 'local' ? 'ollama' : config.service;
            originalApiKeyRef.current = getApiKey(service);
            
            // Save the currently focused element
            previousActiveElementRef.current = document.activeElement;
            
            // Focus the first focusable element in the drawer (close button)
            setTimeout(() => {
                if (drawerRef.current) {
                    const firstFocusable = drawerRef.current.querySelector(
                        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    if (firstFocusable) {
                        firstFocusable.focus();
                    }
                }
            }, 100);
        } else {
            // Restore focus to the element that opened the drawer
            if (previousActiveElementRef.current && previousActiveElementRef.current.focus) {
                previousActiveElementRef.current.focus();
            }
        }
    }, [settingsOpen]);

    const updateConfig = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };
    
    // Save when drawer closes (but not when cancelled via Escape)
    const prevSettingsOpenRef = useRef(settingsOpen);
    const cancelledRef = useRef(false);
    useEffect(() => {
        // Only save if drawer was open and is now closed, and wasn't cancelled
        if (prevSettingsOpenRef.current && !settingsOpen && !cancelledRef.current) {
            saveConversation();
        }
        if (!settingsOpen) {
            cancelledRef.current = false;
        }
        prevSettingsOpenRef.current = settingsOpen;
    }, [settingsOpen, saveConversation]);

    // Close drawer when clicking outside or pressing Escape, and trap focus
    useEffect(() => {
        if (!settingsOpen) return;

        const handleClickOutside = (e) => {
            if (drawerRef.current && !drawerRef.current.contains(e.target)) {
                setSettingsOpen(false);
            }
        };

        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                // Revert config to original values
                if (originalConfigRef.current) {
                    setConfig(originalConfigRef.current);
                }
                // Revert API key to original value
                if (originalApiKeyRef.current !== null) {
                    const originalService = originalConfigRef.current?.service;
                    if (originalService) {
                        const service = originalService === 'local' ? 'ollama' : originalService;
                        saveApiKey(service, originalApiKeyRef.current);
                        setApiKeyState(originalApiKeyRef.current);
                    }
                }
                cancelledRef.current = true;
                setSettingsOpen(false);
            }
        };

        const handleEnter = (e) => {
            // Enter on input fields (text, number, password) saves and closes
            // But not on buttons (which should activate) or selects (which might open dropdown)
            if (e.key === 'Enter') {
                const activeElement = document.activeElement;
                const isInput = activeElement.tagName === 'INPUT' && 
                    (activeElement.type === 'text' || 
                     activeElement.type === 'number' || 
                     activeElement.type === 'password');
                
                if (isInput && drawerRef.current?.contains(activeElement)) {
                    e.preventDefault();
                    cancelledRef.current = false;
                    setSettingsOpen(false);
                }
            }
        };

        const handleTab = (e) => {
            if (e.key !== 'Tab' || !drawerRef.current) return;

            const focusableElements = drawerRef.current.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];

            // If no focusable elements, allow default behavior
            if (focusableElements.length === 0) return;

            // If only one focusable element, prevent tabbing
            if (focusableElements.length === 1) {
                e.preventDefault();
                firstFocusable.focus();
                return;
            }

            // If Shift+Tab on first element, move to last
            if (e.shiftKey && document.activeElement === firstFocusable) {
                e.preventDefault();
                lastFocusable.focus();
                return;
            }

            // If Tab on last element, move to first
            if (!e.shiftKey && document.activeElement === lastFocusable) {
                e.preventDefault();
                firstFocusable.focus();
                return;
            }

            // Check if focus is outside the drawer
            const activeElement = document.activeElement;
            const isFocusInside = drawerRef.current.contains(activeElement);
            
            if (!isFocusInside) {
                e.preventDefault();
                if (e.shiftKey) {
                    lastFocusable.focus();
                } else {
                    firstFocusable.focus();
                }
            }
        };

        // Use a small delay to avoid immediate closure when opening
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 100);

        document.addEventListener('keydown', handleEscape);
        document.addEventListener('keydown', handleTab);
        document.addEventListener('keydown', handleEnter);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
            document.removeEventListener('keydown', handleTab);
            document.removeEventListener('keydown', handleEnter);
        };
    }, [settingsOpen, setSettingsOpen, setConfig]);

    const handleApiKeyChange = (e) => {
        const value = e.target.value;
        setApiKeyState(value);
        const service = config.service === 'local' ? 'ollama' : config.service;
        saveApiKey(service, value);
    };

    if (!settingsOpen) return null;

    return (
        <>
            <div 
                className="settings-drawer-backdrop" 
                onClick={() => setSettingsOpen(false)}
                tabIndex={-1}
                aria-hidden="true"
            />
            <aside 
                ref={drawerRef} 
                className="settings-drawer open" 
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-drawer-title"
            >
                <div className="settings-drawer-header">
                    <div>
                        <h2 id="settings-drawer-title">Playground settings</h2>
                        <p>Configure models and response options.</p>
                    </div>
                    <button 
                        className="icon-button" 
                        onClick={() => setSettingsOpen(false)}
                        aria-label="Close and save settings"
                        title="Close and save settings"
                    >
                        <FaTimes />
                    </button>
                </div>
                <div className="settings-drawer-body">
                    <div className="config-panel">
                        <section className="config-section">
                            <div className="config-section-header">
                                <h2><FaServer style={{ marginRight: '8px', verticalAlign: 'middle' }} />Model & service</h2>
                            </div>
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
                                <label><FaKey style={{ marginRight: '4px' }} />API Key</label>
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={handleApiKeyChange}
                                    placeholder="Enter API key (optional)"
                                />
                                <small className="config-hint">Stored locally in your browser.</small>
                            </div>
                            <details className="config-advanced">
                                <summary><FaSlidersH style={{ marginRight: '4px' }} />Advanced options</summary>
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
                            <div className="config-section-header">
                                <h2><FaCode style={{ marginRight: '8px', verticalAlign: 'middle' }} />Response mode</h2>
                            </div>
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
