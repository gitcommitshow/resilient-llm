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
        className="fixed inset-0 z-40 animate-fade-in"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="fixed top-0 right-0 h-full w-[360px] max-w-[90vw] z-50 flex flex-col animate-slide-up"
        style={{
          background: 'var(--color-background)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 h-14"
          style={{ borderBottom: '1px solid var(--color-gray-200)' }}
        >
          <span style={{ fontWeight: 600, fontSize: '15px' }}>Settings</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--color-gray-100)' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-gray-200)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-gray-100)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Provider */}
          <div>
            <label
              className="block text-[12px] mb-2"
              style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}
            >
              Provider
            </label>
            <select
              value={settings.aiService}
              onChange={(e) => {
                const newService = SERVICES.find(s => s.value === e.target.value);
                updateSetting('aiService', e.target.value);
                if (newService) {
                  updateSetting('model', newService.models[0]);
                }
              }}
              className="input w-full"
              style={{ fontSize: '14px' }}
            >
              {SERVICES.map(service => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div>
            <label
              className="block text-[12px] mb-2"
              style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}
            >
              Model
            </label>
            <select
              value={settings.model}
              onChange={(e) => updateSetting('model', e.target.value)}
              className="input w-full"
              style={{ fontSize: '14px' }}
            >
              {currentService.models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>

          {/* API Key */}
          <div>
            <label
              className="block text-[12px] mb-2"
              style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}
            >
              API Key
            </label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => updateSetting('apiKey', e.target.value)}
              placeholder="sk-..."
              className="input w-full"
              style={{
                fontSize: '13px',
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
              }}
            />
            <p
              className="text-[11px] mt-1.5"
              style={{ color: 'var(--color-gray-400)' }}
            >
              Optional. Uses environment variable if empty.
            </p>
          </div>

          <div className="divider" />

          {/* Temperature */}
          <div>
            <div className="flex justify-between text-[12px] mb-2">
              <span style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}>Temperature</span>
              <span
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
                  color: 'var(--color-foreground)',
                }}
              >
                {settings.temperature}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature}
              onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-accent) ${(settings.temperature / 2) * 100}%, var(--color-gray-200) ${(settings.temperature / 2) * 100}%)`,
                accentColor: 'var(--color-accent)',
              }}
            />
          </div>

          {/* Max Tokens */}
          <div>
            <label
              className="block text-[12px] mb-2"
              style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}
            >
              Max Tokens
            </label>
            <input
              type="number"
              min="1"
              max="8192"
              value={settings.maxTokens}
              onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 2048)}
              className="input w-full"
              style={{
                fontSize: '14px',
                fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="p-5"
          style={{ borderTop: '1px solid var(--color-gray-200)' }}
        >
          <button onClick={onClose} className="btn btn-primary w-full">
            Done
          </button>
        </div>
      </aside>
    </>
  );
}
