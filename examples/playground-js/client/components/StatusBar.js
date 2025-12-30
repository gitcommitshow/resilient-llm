/**
 * StatusBar - Displays current service, model, and mode status
 */

export class StatusBar {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.serviceEl
     * @param {HTMLElement} options.modelEl
     * @param {HTMLElement} options.modeEl
     * @param {HTMLElement} [options.containerEl] - The status bar container element
     */
    constructor({ serviceEl, modelEl, modeEl, containerEl }) {
        this.serviceEl = serviceEl;
        this.modelEl = modelEl;
        this.modeEl = modeEl;
        this.containerEl = containerEl;
    }

    /**
     * Update the status bar with current config
     * @param {Object} config
     */
    update(config) {
        if (this.serviceEl) {
            this.serviceEl.textContent = config.service || '—';
        }
        if (this.modelEl) {
            this.modelEl.textContent = config.model || '—';
        }
        if (this.modeEl) {
            this.modeEl.textContent = config.responseMode === 'json' ? 'JSON' : 'Text';
        }
    }

    /**
     * Trigger a visual pulse to indicate config was saved
     */
    pulse() {
        if (!this.containerEl) return;
        
        this.containerEl.classList.add('saved');
        setTimeout(() => {
            if (this.containerEl) {
                this.containerEl.classList.remove('saved');
            }
        }, 1200);
    }
}

