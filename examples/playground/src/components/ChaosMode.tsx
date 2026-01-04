'use client';

interface ChaosModeProps {
  enabled: boolean;
  config: {
    failureRate: number;
    delayMs: number;
    simulateRateLimit: boolean;
  };
  onToggle: () => void;
  onConfigChange: (config: ChaosModeProps['config']) => void;
}

export default function ChaosMode({ enabled, config, onToggle, onConfigChange }: ChaosModeProps) {
  return (
    <div
      className="card p-4 transition-all"
      style={{
        borderColor: enabled ? 'var(--color-error)' : undefined,
        background: enabled ? 'rgba(255, 59, 48, 0.06)' : undefined,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: enabled
                ? 'var(--color-error)'
                : 'var(--color-gray-200)',
              transition: 'background 0.2s ease',
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke={enabled ? 'white' : 'var(--color-gray-500)'}
              strokeWidth="2"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500 }}>Chaos Mode</div>
            <div style={{ fontSize: '12px', color: 'var(--color-gray-500)' }}>
              Simulate failures
            </div>
          </div>
        </div>
        <button
          onClick={onToggle}
          className="relative w-[46px] h-[28px] rounded-full transition-all"
          style={{
            background: enabled ? 'var(--color-error)' : 'var(--color-gray-200)',
          }}
        >
          <span
            className="absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-all"
            style={{
              left: enabled ? '21px' : '3px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </button>
      </div>

      {/* Config */}
      {enabled && (
        <div
          className="space-y-4 pt-4 mt-3 animate-fade-in"
          style={{ borderTop: '1px solid rgba(255, 59, 48, 0.2)' }}
        >
          {/* Failure Rate */}
          <div>
            <div className="flex justify-between text-[12px] mb-2">
              <span style={{ color: 'var(--color-gray-600)' }}>Failure rate</span>
              <span
                style={{
                  color: 'var(--color-error)',
                  fontWeight: 600,
                  fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
                }}
              >
                {Math.round(config.failureRate * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.failureRate}
              onChange={(e) => onConfigChange({ ...config, failureRate: parseFloat(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-error) ${config.failureRate * 100}%, var(--color-gray-200) ${config.failureRate * 100}%)`,
                accentColor: 'var(--color-error)',
              }}
            />
          </div>

          {/* Delay */}
          <div>
            <div className="flex justify-between text-[12px] mb-2">
              <span style={{ color: 'var(--color-gray-600)' }}>Max delay</span>
              <span
                style={{
                  color: 'var(--color-error)',
                  fontWeight: 600,
                  fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
                }}
              >
                {config.delayMs}ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="500"
              value={config.delayMs}
              onChange={(e) => onConfigChange({ ...config, delayMs: parseInt(e.target.value) })}
              className="w-full h-1 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--color-error) ${(config.delayMs / 5000) * 100}%, var(--color-gray-200) ${(config.delayMs / 5000) * 100}%)`,
                accentColor: 'var(--color-error)',
              }}
            />
          </div>

          {/* Rate Limit */}
          <div className="flex items-center justify-between">
            <span style={{ fontSize: '12px', color: 'var(--color-gray-600)' }}>
              Rate limit (429)
            </span>
            <button
              onClick={() => onConfigChange({ ...config, simulateRateLimit: !config.simulateRateLimit })}
              className="relative w-10 h-6 rounded-full transition-all"
              style={{
                background: config.simulateRateLimit ? 'var(--color-error)' : 'var(--color-gray-200)',
              }}
            >
              <span
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all"
                style={{
                  left: config.simulateRateLimit ? '22px' : '4px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
