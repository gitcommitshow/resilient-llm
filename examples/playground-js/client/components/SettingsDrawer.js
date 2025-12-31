/**
 * SettingsDrawer - Settings panel for playground configuration
 */

export class SettingsDrawer {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.drawerEl - The drawer element
     * @param {HTMLElement} options.backdropEl - The backdrop element
     * @param {HTMLElement} options.bodyEl - The drawer body content
     * @param {Object} options.inputs - Input element references
     * @param {HTMLSelectElement} options.inputs.serviceSelect
     * @param {HTMLInputElement} options.inputs.modelSelect
     * @param {HTMLInputElement} options.inputs.apiKeyInput
     * @param {HTMLInputElement} options.inputs.temperatureInput
     * @param {HTMLInputElement} options.inputs.maxTokensInput
     * @param {HTMLInputElement} options.inputs.topPInput
     * @param {HTMLElement} options.inputs.modeToggle
     * @param {Function} [options.onConfigChange] - (config) => void
     * @param {Function} [options.onClose] - () => void
     */
    constructor({ drawerEl, backdropEl, bodyEl, inputs, onConfigChange, onClose }) {
        this.drawerEl = drawerEl;
        this.backdropEl = backdropEl;
        this.bodyEl = bodyEl;
        this.inputs = inputs;
        this.onConfigChange = onConfigChange;
        this.onClose = onClose;
        
        this.isOpen = false;
        this.responseMode = 'text';
        this.clickOutsideHandler = null;
        
        this._bindEvents();
    }

    /**
     * Bind event handlers
     * @private
     */
    _bindEvents() {
        // Mode toggle
        if (this.inputs.modeToggle) {
            this.inputs.modeToggle.addEventListener('click', (e) => {
                const button = e.target.closest('.mode-toggle-button');
                if (!button) return;
                
                const mode = button.getAttribute('data-mode');
                this.responseMode = mode;
                
                Array.from(this.inputs.modeToggle.querySelectorAll('.mode-toggle-button')).forEach((btn) => {
                    btn.classList.toggle('mode-toggle-button-active', btn === button);
                });
                
                this._emitConfigChange();
            });
        }

        // Service change
        if (this.inputs.serviceSelect) {
            this.inputs.serviceSelect.addEventListener('change', () => this._emitConfigChange());
        }

        // Model change
        if (this.inputs.modelSelect) {
            this.inputs.modelSelect.addEventListener('input', () => this._emitConfigChange());
        }

        // Temperature change
        if (this.inputs.temperatureInput) {
            this.inputs.temperatureInput.addEventListener('input', () => this._emitConfigChange());
        }

        // Max tokens change
        if (this.inputs.maxTokensInput) {
            this.inputs.maxTokensInput.addEventListener('input', () => this._emitConfigChange());
        }

        // Top P change
        if (this.inputs.topPInput) {
            this.inputs.topPInput.addEventListener('input', () => this._emitConfigChange());
        }
    }

    /**
     * Emit config change event
     * @private
     */
    _emitConfigChange() {
        if (this.onConfigChange) {
            this.onConfigChange(this.getConfig());
        }
    }

    /**
     * Open the drawer
     */
    open() {
        this.isOpen = true;
        this.drawerEl.classList.add('open');
        this.backdropEl.classList.add('visible');
        this.drawerEl.setAttribute('aria-hidden', 'false');
        
        // Close drawer when clicking outside (backdrop clicks are handled separately)
        this.clickOutsideHandler = (e) => {
            // Close if click is outside the drawer (backdrop clicks are handled by backdrop click handler)
            if (!this.drawerEl.contains(e.target)) {
                this.close();
            }
        };
        
        // Use a small delay to avoid immediate closure when opening
        setTimeout(() => {
            document.addEventListener('mousedown', this.clickOutsideHandler);
        }, 100);
    }

    /**
     * Close the drawer
     */
    close() {
        this.isOpen = false;
        this.drawerEl.classList.remove('open');
        this.backdropEl.classList.remove('visible');
        this.drawerEl.setAttribute('aria-hidden', 'true');
        
        // Remove click outside handler
        if (this.clickOutsideHandler) {
            document.removeEventListener('mousedown', this.clickOutsideHandler);
            this.clickOutsideHandler = null;
        }
        
        if (this.onClose) this.onClose();
    }

    /**
     * Toggle the drawer
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Set the config values in the UI
     * @param {Object} config
     */
    setConfig(config) {
        if (!config) return;
        
        if (this.inputs.serviceSelect && config.service !== undefined) {
            this.inputs.serviceSelect.value = config.service || '';
        }
        
        if (this.inputs.modelSelect && config.model !== undefined) {
            this.inputs.modelSelect.value = config.model || '';
        }
        
        if (config.responseMode !== undefined) {
            this.responseMode = config.responseMode;
            if (this.inputs.modeToggle) {
                Array.from(this.inputs.modeToggle.querySelectorAll('.mode-toggle-button')).forEach((btn) => {
                    const mode = btn.getAttribute('data-mode');
                    btn.classList.toggle('mode-toggle-button-active', mode === this.responseMode);
                });
            }
        }
        
        if (this.inputs.temperatureInput && config.temperature !== undefined) {
            this.inputs.temperatureInput.value = config.temperature || '';
        }
        
        if (this.inputs.maxTokensInput && config.maxTokens !== undefined) {
            this.inputs.maxTokensInput.value = config.maxTokens || '';
        }
        
        if (this.inputs.topPInput && config.topP !== undefined) {
            this.inputs.topPInput.value = config.topP || '';
        }
    }

    /**
     * Get the current config from the UI
     * @returns {Object}
     */
    getConfig() {
        return {
            service: this.inputs.serviceSelect?.value || '',
            model: this.inputs.modelSelect?.value || '',
            responseMode: this.responseMode,
            temperature: this.inputs.temperatureInput?.value || '',
            maxTokens: this.inputs.maxTokensInput?.value || '',
            topP: this.inputs.topPInput?.value || ''
        };
    }

    /**
     * Get the response mode
     * @returns {'text'|'json'}
     */
    getResponseMode() {
        return this.responseMode;
    }
}

