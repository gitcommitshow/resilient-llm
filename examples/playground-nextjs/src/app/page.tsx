'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import SettingsPanel from '@/components/SettingsPanel';
import ResilienceLog from '@/components/ResilienceLog';
import ChaosMode from '@/components/ChaosMode';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface LogEntry {
  type: 'info' | 'success' | 'error' | 'chaos' | 'retry';
  message: string;
  timestamp: number;
}

export default function Playground() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resilienceLogExpanded, setResilienceLogExpanded] = useState(true);
  const [resilienceLogs, setResilienceLogs] = useState<LogEntry[]>([]);

  const [settings, setSettings] = useState({
    aiService: 'openai',
    model: 'gpt-4o-mini',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 2048,
  });

  const [chaosEnabled, setChaosEnabled] = useState(false);
  const [chaosConfig, setChaosConfig] = useState({
    failureRate: 0.5,
    delayMs: 2000,
    simulateRateLimit: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    const userMessage: Message = { role: 'user', content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setIsLoading(true);
    setResilienceLogs([]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          aiService: settings.aiService,
          model: settings.model,
          apiKey: settings.apiKey || undefined,
          maxTokens: settings.maxTokens,
          temperature: settings.temperature,
          chaosMode: chaosEnabled,
          chaosConfig,
        }),
      });

      const data = await response.json();

      if (data.resilienceLog) {
        setResilienceLogs(data.resilienceLog);
      }

      if (data.error) {
        setMessages([
          ...newMessages,
          {
            role: 'assistant',
            content: `Error: ${data.error}${data.chaosTriggered ? ' (Chaos mode)' : ''}`,
          },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: data.response },
        ]);
      }
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setResilienceLogs([]);
  };

  return (
    <div
      className="h-screen flex flex-col"
      style={{ background: 'var(--color-background)' }}
    >
      {/* Header - Apple style navbar */}
      <header
        className="shrink-0 h-12 flex items-center justify-between px-4 glass"
        style={{
          borderBottom: '1px solid var(--color-gray-200)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--color-accent)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.02em' }}>
            ResilientLLM
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="hidden sm:block text-[12px] px-2 py-1 rounded-md"
            style={{
              background: 'var(--color-surface)',
              color: 'var(--color-gray-500)',
              fontFamily: 'ui-monospace, SFMono-Regular, SF Mono, Menlo, monospace',
            }}
          >
            {settings.model}
          </span>

          <button
            onClick={() => setSettingsOpen(true)}
            className="btn btn-sm btn-icon"
            title="Settings"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className="hidden lg:flex flex-col w-72 p-4 gap-4 shrink-0"
          style={{
            borderRight: '1px solid var(--color-gray-200)',
            background: 'var(--color-surface)',
          }}
        >
          <ChaosMode
            enabled={chaosEnabled}
            config={chaosConfig}
            onToggle={() => setChaosEnabled(!chaosEnabled)}
            onConfigChange={setChaosConfig}
          />

          <div className="card p-4">
            <div
              className="text-[12px] mb-3"
              style={{ color: 'var(--color-gray-500)', fontWeight: 500 }}
            >
              Quick Actions
            </div>
            <div className="space-y-1">
              <button
                onClick={clearChat}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors"
                style={{ color: 'var(--color-foreground)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-gray-100)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Clear conversation
              </button>
              <button
                onClick={() => setMessages([{ role: 'system', content: 'You are a helpful assistant.' }])}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors"
                style={{ color: 'var(--color-foreground)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-gray-100)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4M12 8h.01"/>
                </svg>
                Add system prompt
              </button>
            </div>
          </div>

          <div className="mt-auto">
            <div
              className="text-[11px] mb-2"
              style={{ color: 'var(--color-gray-400)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Resilience Features
            </div>
            <ul className="space-y-1.5 text-[12px]" style={{ color: 'var(--color-gray-500)' }}>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--color-success)' }}>●</span>
                Circuit breakers
              </li>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--color-success)' }}>●</span>
                Exponential backoff
              </li>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--color-success)' }}>●</span>
                Rate limiting
              </li>
              <li className="flex items-center gap-2">
                <span style={{ color: 'var(--color-success)' }}>●</span>
                Multi-provider fallback
              </li>
            </ul>
          </div>
        </aside>

        {/* Chat */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                    style={{
                      background: 'linear-gradient(135deg, var(--color-accent), #5856d6)',
                      boxShadow: '0 8px 24px rgba(0, 122, 255, 0.25)',
                    }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <h2
                    className="text-xl mb-2"
                    style={{ fontWeight: 600, letterSpacing: '-0.02em' }}
                  >
                    Start a conversation
                  </h2>
                  <p
                    className="text-[14px] max-w-xs"
                    style={{ color: 'var(--color-gray-500)', lineHeight: 1.5 }}
                  >
                    Test ResilientLLM with different providers.
                    Enable Chaos Mode to simulate failures.
                  </p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <ChatMessage key={index} role={message.role} content={message.content} />
                ))
              )}

              {isLoading && (
                <div className="flex justify-start animate-slide-up">
                  <div
                    className="bubble bubble-assistant"
                    style={{ padding: '12px 16px' }}
                  >
                    <div className="flex gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full typing-dot"
                        style={{ background: 'var(--color-gray-400)' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full typing-dot"
                        style={{ background: 'var(--color-gray-400)' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full typing-dot"
                        style={{ background: 'var(--color-gray-400)' }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Resilience Log */}
          <ResilienceLog
            logs={resilienceLogs}
            isExpanded={resilienceLogExpanded}
            onToggle={() => setResilienceLogExpanded(!resilienceLogExpanded)}
          />

          {/* Input */}
          <div
            className="shrink-0 p-4"
            style={{ borderTop: '1px solid var(--color-gray-200)' }}
          >
            <div className="max-w-2xl mx-auto">
              <ChatInput
                onSend={sendMessage}
                disabled={isLoading}
                placeholder={chaosEnabled ? "Message (chaos mode)" : "Message"}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile chaos toggle */}
      <button
        onClick={() => setChaosEnabled(!chaosEnabled)}
        className="lg:hidden fixed bottom-24 right-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all"
        style={{
          background: chaosEnabled ? 'var(--color-error)' : 'var(--color-surface-elevated)',
          color: chaosEnabled ? '#ffffff' : 'var(--color-gray-500)',
          boxShadow: chaosEnabled
            ? '0 4px 16px rgba(255, 59, 48, 0.4)'
            : 'var(--shadow-lg)',
        }}
        title="Toggle Chaos Mode"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
      </button>

      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
