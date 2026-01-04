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
    <div className={`rounded-lg border p-4 transition-all ${
      enabled
        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 chaos-active'
        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔥</span>
          <div>
            <h3 className="text-sm font-semibold">Chaos Mode</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Simulate failures to test resilience
            </p>
          </div>
        </div>
        <button
          onClick={onToggle}
          className={`relative w-12 h-6 rounded-full transition-colors ${
            enabled ? 'bg-red-500' : 'bg-zinc-300 dark:bg-zinc-600'
          }`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              enabled ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Config (only shown when enabled) */}
      {enabled && (
        <div className="space-y-3 pt-3 border-t border-red-200 dark:border-red-800">
          {/* Failure Rate */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <label className="text-zinc-600 dark:text-zinc-300">Failure Rate</label>
              <span className="font-mono text-red-600 dark:text-red-400">
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
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
          </div>

          {/* Delay */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <label className="text-zinc-600 dark:text-zinc-300">Random Delay</label>
              <span className="font-mono text-red-600 dark:text-red-400">
                0-{config.delayMs}ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="500"
              value={config.delayMs}
              onChange={(e) => onConfigChange({ ...config, delayMs: parseInt(e.target.value) })}
              className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
          </div>

          {/* Rate Limit Simulation */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-zinc-600 dark:text-zinc-300">
              Simulate Rate Limits (429)
            </label>
            <button
              onClick={() => onConfigChange({ ...config, simulateRateLimit: !config.simulateRateLimit })}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                config.simulateRateLimit ? 'bg-red-500' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  config.simulateRateLimit ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Info */}
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1.5 rounded">
            Chaos mode will randomly fail requests to demonstrate how ResilientLLM handles failures with retries and fallbacks.
          </p>
        </div>
      )}
    </div>
  );
}
