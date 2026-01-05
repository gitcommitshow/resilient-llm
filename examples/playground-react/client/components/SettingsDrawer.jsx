/**
 * Settings Drawer Component - configuration panel
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { getApiKey, saveApiKey } from '../utils';
import { MODELS_API_URL } from '../utils/constants';
import { getProviderIds, getProviderDisplayName } from '../utils/providerUtils';
import { FaTimes, FaServer, FaKey, FaSlidersH, FaCode, FaFileAlt, FaShieldAlt, FaTint } from 'react-icons/fa';

// Helper function to render resilience settings section
function ResilienceSettingsSection({ config, updateConfig, sectionRef }) {
    return (
        <section ref={sectionRef} className="config-section">
            <div className="config-section-header">
                <h2><FaShieldAlt style={{ marginRight: '8px', verticalAlign: 'middle' }} />Resilience settings</h2>
            </div>
            <div className="resilience-settings-compact">
                <div className="resilience-grid">
                    <div className="resilience-field">
                        <label>Retries</label>
                        <input
                            type="number"
                            min="0"
                            max="10"
                            value={config.retries || '3'}
                            onChange={e => updateConfig('retries', e.target.value)}
                            placeholder="3"
                        />
                        <small className="resilience-hint">Retry attempts before giving up.</small>
                    </div>
                    <div className="resilience-field">
                        <label>Backoff multiplier</label>
                        <input
                            type="number"
                            step="0.1"
                            min="1"
                            max="10"
                            value={config.backoffFactor || '2'}
                            onChange={e => updateConfig('backoffFactor', e.target.value)}
                            placeholder="2"
                        />
                        <small className="resilience-hint">
                            Multiply wait time by ({config.backoffFactor || '2'}): {(() => {
                                const factor = parseFloat(config.backoffFactor || '2') || 2;
                                const waits = [];
                                let wait = 1;
                                for (let i = 0; i < 4; i++) {
                                    waits.push(`${wait}s`);
                                    wait = Math.round(wait * factor * 10) / 10;
                                }
                                return waits.join(' → ');
                            })()}
                        </small>
                    </div>
                </div>
                <div className="resilience-field resilience-field-full">
                    <label>Timeout (s)</label>
                    <input
                        type="number"
                        min="1"
                        value={Math.round((parseInt(config.timeout || '60000', 10)) / 1000)}
                        onChange={e => updateConfig('timeout', String(parseInt(e.target.value, 10) * 1000))}
                        placeholder="60"
                    />
                    <small className="resilience-hint">Total timeout for entire operation including all retries.</small>
                </div>
                <div className="resilience-divider"></div>
                <div className="resilience-subgroup">
                    <div className="resilience-subgroup-header">
                        <FaTint style={{ marginRight: '6px', verticalAlign: 'middle', fontSize: '0.9em' }} />
                        <span>Rate limiting</span>
                    </div>
                    <small className="resilience-hint resilience-hint-note">Token bucket algorithm controls request and token consumption. When empty, requests wait for tokens to replenish. Applied per LLM provider.</small>
                    <div className="resilience-grid">
                        <div className="resilience-field">
                            <label>Requests/min</label>
                            <input
                                type="number"
                                min="1"
                                value={config.requestsPerMinute || '60'}
                                onChange={e => updateConfig('requestsPerMinute', e.target.value)}
                                placeholder="60"
                            />
                            <small className="resilience-hint">Max API requests per minute.</small>
                        </div>
                        <div className="resilience-field">
                            <label>Tokens/min</label>
                            <input
                                type="number"
                                min="1"
                                value={config.llmTokensPerMinute || '90000'}
                                onChange={e => updateConfig('llmTokensPerMinute', e.target.value)}
                                placeholder="90000"
                            />
                            <small className="resilience-hint">Max total tokens (input + output) per minute.</small>
                        </div>
                    </div>
                </div>
                <div className="resilience-divider"></div>
                <div className="resilience-subgroup">
                    <div className="resilience-subgroup-header">
                        <span>Circuit breaker & concurrency</span>
                    </div>
                    <small className="resilience-hint resilience-hint-note">When failures exceed threshold, circuit opens (blocks requests). After cooldown, it attempts to close (resume operation).</small>
                    <div className="resilience-grid">
                        <div className="resilience-field">
                            <label>Failure threshold</label>
                            <input
                                type="number"
                                min="1"
                                value={config.circuitBreakerFailureThreshold || '5'}
                                onChange={e => updateConfig('circuitBreakerFailureThreshold', e.target.value)}
                                placeholder="5"
                            />
                            <small className="resilience-hint">Total failed attempts across all operations before circuit opens.</small>
                        </div>
                        <div className="resilience-field">
                            <label>Cooldown (s)</label>
                            <input
                                type="number"
                                min="1"
                                value={Math.round((parseInt(config.circuitBreakerCooldownPeriod || '30000', 10)) / 1000)}
                                onChange={e => updateConfig('circuitBreakerCooldownPeriod', String(parseInt(e.target.value, 10) * 1000))}
                                placeholder="30"
                            />
                            <small className="resilience-hint">Wait time before attempting to close circuit breaker.</small>
                        </div>
                        <div className="resilience-field resilience-field-full">
                            <label>Max concurrent</label>
                            <input
                                type="number"
                                min="1"
                                value={config.maxConcurrent || ''}
                                onChange={e => updateConfig('maxConcurrent', e.target.value)}
                                placeholder="Unlimited"
                            />
                            <small className="resilience-hint">Max concurrent operations (bulkhead pattern).</small>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export function SettingsDrawer() {
    const { settingsOpen, setSettingsOpen, config, setConfig, saveConversation, settingsDefaultSection } = useApp();
    const [apiKey, setApiKeyState] = useState('');
    const [models, setModels] = useState([]);
    const [filteredModels, setFilteredModels] = useState([]);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const originalConfigRef = useRef(null);
    const originalApiKeyRef = useRef(null);
    const drawerRef = useRef(null);
    const previousActiveElementRef = useRef(null);
    const modelInputRef = useRef(null);
    const autocompleteRef = useRef(null);
    const resilienceSectionRef = useRef(null);
    const modelsSectionRef = useRef(null);
    const hasScrolledRef = useRef(false);

    // Load API key when service changes or drawer opens
    useEffect(() => {
        if (config.service) {
            const service = config.service === 'local' ? 'ollama' : config.service;
            setApiKeyState(getApiKey(service));
        } else {
            setApiKeyState('');
        }
    }, [config.service, settingsOpen]);

    // Filter models based on input
    const filterModels = useCallback((input, modelsList) => {
        if (!modelsList || modelsList.length === 0) {
            setFilteredModels([]);
            return;
        }
        
        if (!input || !input.trim()) {
            setFilteredModels(modelsList.slice(0, 10)); // Show first 10 if no input
            return;
        }
        
        const lowerInput = input.toLowerCase();
        const filtered = modelsList.filter(model => 
            model.id.toLowerCase().includes(lowerInput) ||
            (model.name && model.name.toLowerCase().includes(lowerInput))
        ).slice(0, 10); // Limit to 10 results
        
        setFilteredModels(filtered);
    }, []);

    // Fetch models when service changes
    useEffect(() => {
        const fetchModels = async () => {
            if (!config.service || config.service === '') {
                setModels([]);
                setFilteredModels([]);
                return;
            }

            try {
                const service = config.service === 'local' ? 'ollama' : config.service;
                const apiKey = getApiKey(service);
                
                const params = new URLSearchParams({ service });
                if (apiKey) {
                    params.append('apiKey', apiKey);
                }

                const response = await fetch(`${MODELS_API_URL}?${params.toString()}`);
                const data = await response.json();
                
                if (data.success && data.models) {
                    setModels(data.models);
                    filterModels(config.model || '', data.models);
                } else {
                    setModels([]);
                    setFilteredModels([]);
                }
            } catch (error) {
                console.error('Error fetching models:', error);
                setModels([]);
                setFilteredModels([]);
            }
        };

        fetchModels();
    }, [config.service, filterModels]);

    // Update filtered models when models or model input changes
    useEffect(() => {
        if (models.length > 0) {
            filterModels(config.model || '', models);
        }
    }, [models, config.model, filterModels]);

    // Handle model input change
    const handleModelChange = (e) => {
        const value = e.target.value;
        updateConfig('model', value);
        filterModels(value, models);
        setShowAutocomplete(true);
        setSelectedIndex(-1);
    };

    // Handle model selection from autocomplete
    const handleModelSelect = (modelId) => {
        updateConfig('model', modelId);
        setShowAutocomplete(false);
        setSelectedIndex(-1);
        if (modelInputRef.current) {
            modelInputRef.current.focus();
        }
    };

    // Handle keyboard navigation in autocomplete
    useEffect(() => {
        if (!showAutocomplete || filteredModels.length === 0) return;

        const handleKeyDown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => 
                    prev < filteredModels.length - 1 ? prev + 1 : prev
                );
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                handleModelSelect(filteredModels[selectedIndex].id);
            } else if (e.key === 'Escape') {
                setShowAutocomplete(false);
                setSelectedIndex(-1);
            }
        };

        const input = modelInputRef.current;
        if (input) {
            input.addEventListener('keydown', handleKeyDown);
            return () => input.removeEventListener('keydown', handleKeyDown);
        }
    }, [showAutocomplete, filteredModels, selectedIndex]);

    // Save original config when drawer opens and manage focus
    useEffect(() => {
        if (settingsOpen) {
            // Reset scroll flag when drawer opens
            hasScrolledRef.current = false;
            
            originalConfigRef.current = { ...config };
            const service = config.service === 'local' ? 'ollama' : config.service;
            originalApiKeyRef.current = getApiKey(service);
            
            // Save the currently focused element
            previousActiveElementRef.current = document.activeElement;
            
            // Scroll to the appropriate section based on settingsDefaultSection (only once per drawer open)
            setTimeout(() => {
                if (drawerRef.current && !hasScrolledRef.current) {
                    const targetSection = settingsDefaultSection === 'resilience' 
                        ? resilienceSectionRef.current 
                        : modelsSectionRef.current;
                    
                    if (targetSection) {
                        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        hasScrolledRef.current = true;
                    }
                    
                    // Focus the first focusable element in the drawer (close button) only if not already focused
                    if (document.activeElement === previousActiveElementRef.current) {
                        const firstFocusable = drawerRef.current.querySelector(
                            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                        );
                        if (firstFocusable) {
                            firstFocusable.focus();
                        }
                    }
                }
            }, 100);
        } else {
            // Reset scroll flag when drawer closes
            hasScrolledRef.current = false;
            
            // Restore focus to the element that opened the drawer
            if (previousActiveElementRef.current && previousActiveElementRef.current.focus) {
                previousActiveElementRef.current.focus();
            }
        }
    }, [settingsOpen, settingsDefaultSection]); // Only run when drawer opens/closes or default section changes

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
                        {settingsDefaultSection === 'resilience' ? (
                            <>
                                <ResilienceSettingsSection 
                                    config={config} 
                                    updateConfig={updateConfig} 
                                    sectionRef={resilienceSectionRef}
                                />
                                <section ref={modelsSectionRef} className="config-section">
                                    <div className="config-section-header">
                                        <h2><FaServer style={{ marginRight: '8px', verticalAlign: 'middle' }} />Model & service</h2>
                                    </div>
                            <div className="config-field">
                                <label>Service</label>
                                <select value={config.service} onChange={e => updateConfig('service', e.target.value)}>
                                    <option value="">Select service</option>
                                    {getProviderIds().map(providerId => (
                                        <option key={providerId} value={providerId}>
                                            {getProviderDisplayName(providerId)}
                                        </option>
                                    ))}
                                    <option value="local">Local / Other</option>
                                </select>
                            </div>
                            <div className="config-field" style={{ position: 'relative' }}>
                                <label>Model</label>
                                <input
                                    ref={modelInputRef}
                                    type="text"
                                    value={config.model}
                                    onChange={handleModelChange}
                                    onFocus={() => {
                                        if (filteredModels.length > 0) {
                                            setShowAutocomplete(true);
                                        }
                                    }}
                                    onBlur={(e) => {
                                        // Delay hiding to allow click on autocomplete items
                                        setTimeout(() => {
                                            if (!autocompleteRef.current?.contains(document.activeElement)) {
                                                setShowAutocomplete(false);
                                            }
                                        }, 200);
                                    }}
                                    placeholder="e.g. gpt-4o-mini"
                                    autoComplete="off"
                                />
                                {showAutocomplete && filteredModels.length > 0 && (
                                    <div 
                                        ref={autocompleteRef}
                                        className="model-autocomplete"
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            backgroundColor: '#ffffff',
                                            border: '1px solid #e4e4e7',
                                            borderRadius: '6px',
                                            marginTop: '4px',
                                            maxHeight: '200px',
                                            overflowY: 'auto',
                                            zIndex: 50,
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                        }}
                                    >
                                        {filteredModels.map((model, index) => (
                                            <div
                                                key={model.id}
                                                onClick={() => handleModelSelect(model.id)}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    backgroundColor: selectedIndex === index 
                                                        ? '#f4f4f5' 
                                                        : 'transparent',
                                                    borderBottom: index < filteredModels.length - 1 
                                                        ? '1px solid #e4e4e7' 
                                                        : 'none',
                                                    transition: 'background-color 0.15s ease'
                                                }}
                                            >
                                                <div style={{ 
                                                    fontWeight: '500',
                                                    color: '#09090b',
                                                    fontSize: '13px'
                                                }}>
                                                    {model.id}
                                                </div>
                                                {model.name && model.name !== model.id && (
                                                    <div style={{ 
                                                        fontSize: '12px', 
                                                        color: '#71717a',
                                                        marginTop: '2px'
                                                    }}>
                                                        {model.name}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                            </>
                        ) : (
                            <>
                                <section ref={modelsSectionRef} className="config-section">
                                    <div className="config-section-header">
                                        <h2><FaServer style={{ marginRight: '8px', verticalAlign: 'middle' }} />Model & service</h2>
                                    </div>
                                    <div className="config-field">
                                        <label>Service</label>
                                        <select value={config.service} onChange={e => updateConfig('service', e.target.value)}>
                                            <option value="">Select service</option>
                                            {getProviderIds().map(providerId => (
                                                <option key={providerId} value={providerId}>
                                                    {getProviderDisplayName(providerId)}
                                                </option>
                                            ))}
                                            <option value="local">Local / Other</option>
                                        </select>
                                    </div>
                                    <div className="config-field" style={{ position: 'relative' }}>
                                        <label>Model</label>
                                        <input
                                            ref={modelInputRef}
                                            type="text"
                                            value={config.model}
                                            onChange={handleModelChange}
                                            onFocus={() => {
                                                if (filteredModels.length > 0) {
                                                    setShowAutocomplete(true);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                setTimeout(() => {
                                                    if (!autocompleteRef.current?.contains(document.activeElement)) {
                                                        setShowAutocomplete(false);
                                                    }
                                                }, 200);
                                            }}
                                            placeholder="e.g. gpt-4o-mini"
                                            autoComplete="off"
                                        />
                                        {showAutocomplete && filteredModels.length > 0 && (
                                            <div 
                                                ref={autocompleteRef}
                                                className="model-autocomplete"
                                                style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 0,
                                                    right: 0,
                                                    backgroundColor: '#ffffff',
                                                    border: '1px solid #e4e4e7',
                                                    borderRadius: '6px',
                                                    marginTop: '4px',
                                                    maxHeight: '200px',
                                                    overflowY: 'auto',
                                                    zIndex: 50,
                                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                                                }}
                                            >
                                                {filteredModels.map((model, index) => (
                                                    <div
                                                        key={model.id}
                                                        onClick={() => handleModelSelect(model.id)}
                                                        onMouseEnter={() => setSelectedIndex(index)}
                                                        style={{
                                                            padding: '8px 12px',
                                                            cursor: 'pointer',
                                                            backgroundColor: selectedIndex === index 
                                                                ? '#f4f4f5' 
                                                                : 'transparent',
                                                            borderBottom: index < filteredModels.length - 1 
                                                                ? '1px solid #e4e4e7' 
                                                                : 'none',
                                                            transition: 'background-color 0.15s ease'
                                                        }}
                                                    >
                                                        <div style={{ 
                                                            fontWeight: '500',
                                                            color: '#09090b',
                                                            fontSize: '13px'
                                                        }}>
                                                            {model.id}
                                                        </div>
                                                        {model.name && model.name !== model.id && (
                                                            <div style={{ 
                                                                fontSize: '12px', 
                                                                color: '#71717a',
                                                                marginTop: '2px'
                                                            }}>
                                                                {model.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
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
                                <ResilienceSettingsSection 
                                    config={config} 
                                    updateConfig={updateConfig} 
                                    sectionRef={resilienceSectionRef}
                                />
                            </>
                        )}
                    </div>
                </div>
            </aside>
        </>
    );
}
