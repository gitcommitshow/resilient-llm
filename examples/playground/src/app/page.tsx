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

  // Auto-scroll to bottom when new messages arrive
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
            content: `Error: ${data.error}${data.chaosTriggered ? ' (Chaos mode triggered)' : ''}`,
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
    <div className="flex flex-col h-screen bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">ResilientLLM Playground</h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Test resilience features with circuit breakers, retries & fallbacks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Status Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">Service:</span>
              <span className="font-medium">{settings.aiService}</span>
              <span className="text-zinc-300 dark:text-zinc-600">•</span>
              <span className="text-zinc-500 dark:text-zinc-400">Model:</span>
              <span className="font-medium">{settings.model}</span>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              title="Settings"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-72 border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 gap-4">
          <ChaosMode
            enabled={chaosEnabled}
            config={chaosConfig}
            onToggle={() => setChaosEnabled(!chaosEnabled)}
            onConfigChange={setChaosConfig}
          />

          {/* Quick Actions */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
            <h3 className="text-sm font-semibold mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button
                onClick={clearChat}
                className="w-full px-3 py-2 text-sm text-left rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
                Clear Chat
              </button>
              <button
                onClick={() => {
                  setMessages([
                    { role: 'system', content: 'You are a helpful assistant that explains concepts clearly and concisely.' }
                  ]);
                }}
                className="w-full px-3 py-2 text-sm text-left rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-2"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                Add System Prompt
              </button>
            </div>
          </div>

          {/* About */}
          <div className="mt-auto text-xs text-zinc-500 dark:text-zinc-400">
            <p className="mb-1">
              <strong>ResilientLLM</strong> provides:
            </p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Circuit breakers</li>
              <li>Exponential backoff</li>
              <li>Rate limiting</li>
              <li>Token estimation</li>
              <li>Multi-provider fallback</li>
            </ul>
          </div>
        </aside>

        {/* Chat Area */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-20">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold mb-1">Start a conversation</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm">
                    Send a message to test ResilientLLM. Enable Chaos Mode to see how it handles failures.
                  </p>
                </div>
              ) : (
                messages.map((message, index) => (
                  <ChatMessage key={index} role={message.role} content={message.content} />
                ))
              )}

              {/* Loading indicator */}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-sm font-semibold">
                    AI
                  </div>
                  <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg px-4 py-3">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full bg-zinc-400 typing-dot" />
                      <span className="w-2 h-2 rounded-full bg-zinc-400 typing-dot" />
                      <span className="w-2 h-2 rounded-full bg-zinc-400 typing-dot" />
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
          <div className="flex-shrink-0 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
            <div className="max-w-2xl mx-auto">
              <ChatInput
                onSend={sendMessage}
                disabled={isLoading}
                placeholder={chaosEnabled ? "Type a message (Chaos mode active!)..." : "Type your message..."}
              />
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Chaos Mode Toggle */}
      <div className="lg:hidden fixed bottom-20 right-4">
        <button
          onClick={() => setChaosEnabled(!chaosEnabled)}
          className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all ${
            chaosEnabled
              ? 'bg-red-500 text-white chaos-active'
              : 'bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700'
          }`}
          title="Toggle Chaos Mode"
        >
          🔥
        </button>
      </div>

      {/* Settings Panel */}
      <SettingsPanel
        settings={settings}
        onSettingsChange={setSettings}
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Footer */}
      <footer className="flex-shrink-0 bg-white dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700 px-4 py-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        Made with{' '}
        <a
          href="https://github.com/gitcommitshow/resilient-llm"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-zinc-900 dark:text-zinc-100 hover:underline"
        >
          ResilientLLM
        </a>
      </footer>
    </div>
  );
}
