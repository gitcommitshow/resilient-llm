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
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
      case 'error':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'chaos':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800';
      case 'retry':
        return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    }
  };

  const getTypeIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'chaos':
        return '🔥';
      case 'retry':
        return '↻';
      default:
        return 'ℹ';
    }
  };

  return (
    <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center justify-between text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">Resilience Log</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 max-h-[200px] overflow-y-auto">
          {logs.length === 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400 italic">
              No resilience events yet. Send a message to see logs.
            </p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`flex items-start gap-2 px-3 py-2 rounded-md border text-xs ${getTypeStyles(log.type)}`}
              >
                <span className="flex-shrink-0">{getTypeIcon(log.type)}</span>
                <span className="flex-1">{log.message}</span>
                <span className="flex-shrink-0 opacity-60 font-mono">
                  {log.timestamp}ms
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
