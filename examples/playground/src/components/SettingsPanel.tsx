'use client';

interface SettingsPanelProps {
  settings: {
    aiService: string;
    model: string;
    apiKey: string;
    temperature: number;
    maxTokens: number;
  };
  onSettingsChange: (settings: SettingsPanelProps['settings']) => void;
  isOpen: boolean;
  onClose: () => void;
}

const SERVICES = [
  { value: 'openai', label: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'] },
  { value: 'gemini', label: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { value: 'ollama', label: 'Ollama (Local)', models: ['llama3.1:8b', 'llama3.1:70b', 'mistral', 'codellama'] },
];

export default function SettingsPanel({ settings, onSettingsChange, isOpen, onClose }: SettingsPanelProps) {
  const currentService = SERVICES.find(s => s.value === settings.aiService) || SERVICES[0];

  const updateSetting = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed top-0 right-0 h-full w-[360px] max-w-[90vw] bg-zinc-50 dark:bg-zinc-900 shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Playground Settings</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Configure LLM provider and options</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Service Selection */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
            <h3 className="text-sm font-semibold">Model & Service</h3>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">Service</label>
              <select
                value={settings.aiService}
                onChange={(e) => {
                  const newService = SERVICES.find(s => s.value === e.target.value);
                  updateSetting('aiService', e.target.value);
                  if (newService) {
                    updateSetting('model', newService.models[0]);
                  }
                }}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SERVICES.map(service => (
                  <option key={service.value} value={service.value}>
                    {service.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">Model</label>
              <select
                value={settings.model}
                onChange={(e) => updateSetting('model', e.target.value)}
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {currentService.models.map(model => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 dark:text-zinc-400">API Key</label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => updateSetting('apiKey', e.target.value)}
                placeholder="Enter API key (optional)"
                className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-zinc-400">Leave empty to use environment variable</p>
            </div>
          </div>

          {/* Advanced Options */}
          <details className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <summary className="text-sm font-semibold cursor-pointer">Advanced Options</summary>
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">Temperature</label>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={settings.temperature}
                    onChange={(e) => updateSetting('temperature', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">Max Tokens</label>
                  <input
                    type="number"
                    min="1"
                    max="8192"
                    value={settings.maxTokens}
                    onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 2048)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </details>
        </div>
      </aside>
    </>
  );
}
