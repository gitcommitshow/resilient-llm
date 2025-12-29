/**
 * StatusBar - Displays current service, model, and mode status
 */

export class StatusBar {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.serviceEl
     * @param {HTMLElement} options.modelEl
     * @param {HTMLElement} options.modeEl
     */
    constructor({ serviceEl, modelEl, modeEl }) {
        this.serviceEl = serviceEl;
        this.modelEl = modelEl;
        this.modeEl = modeEl;
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
}

