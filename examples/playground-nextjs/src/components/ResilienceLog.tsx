'use client';

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'chaos' | 'retry';
  message: string;
  timestamp: number;
}

interface ResilienceLogProps {
  logs: LogEntry[];
  isExpanded: boolean;
  onToggle: () => void;
}

export default function ResilienceLog({ logs, isExpanded, onToggle }: ResilienceLogProps) {
  const getTypeStyles = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return { bg: 'rgba(48, 209, 88, 0.12)', color: '#30d158', icon: '✓' };
      case 'error':
        return { bg: 'rgba(255, 59, 48, 0.12)', color: '#ff3b30', icon: '✕' };
      case 'chaos':
        return { bg: 'rgba(255, 159, 10, 0.12)', color: '#ff9f0a', icon: '⚡' };
      case 'retry':
        return { bg: 'rgba(0, 122, 255, 0.12)', color: '#007aff', icon: '↻' };
      default:
        return { bg: 'rgba(142, 142, 147, 0.12)', color: '#8e8e93', icon: 'ℹ' };
    }
  };

  if (logs.length === 0) return null;

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid var(--color-gray-200)',
        background: 'var(--color-surface)',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between text-[13px] transition-colors"
        style={{ color: 'var(--color-gray-600)' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 500 }}>Resilience Log</span>
          <span
            className="px-1.5 py-0.5 rounded text-[11px]"
            style={{
              background: 'var(--color-gray-200)',
              color: 'var(--color-gray-600)',
              fontWeight: 500,
            }}
          >
            {logs.length}
          </span>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {isExpanded && (
        <div
          className="px-4 pb-3 animate-fade-in"
          style={{ maxHeight: '160px', overflowY: 'auto' }}
        >
          <div className="space-y-1.5">
            {logs.map((log, index) => {
              const styles = getTypeStyles(log.type);
              return (
                <div
                  key={index}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px]"
                  style={{
                    background: styles.bg,
                    fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
                  }}
                >
                  <span
                    className="w-4 h-4 flex items-center justify-center rounded text-[10px]"
                    style={{
                      color: styles.color,
                      fontWeight: 600,
                    }}
                  >
                    {styles.icon}
                  </span>
                  <span
                    className="flex-1 truncate"
                    style={{ color: 'var(--color-foreground)', opacity: 0.9 }}
                  >
                    {log.message}
                  </span>
                  <span
                    style={{
                      color: 'var(--color-gray-500)',
                      fontSize: '11px',
                    }}
                  >
                    {log.timestamp}ms
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
