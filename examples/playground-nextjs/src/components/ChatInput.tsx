'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({ onSend, disabled, placeholder = "Message" }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = message.trim() && !disabled;

  return (
    <div
      className="flex items-end gap-2 p-2 rounded-2xl transition-all"
      style={{
        background: 'var(--color-surface)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 px-3 py-2 text-[15px] bg-transparent border-none outline-none resize-none min-h-[36px] max-h-[120px] disabled:opacity-50"
        style={{
          color: 'var(--color-foreground)',
          letterSpacing: '-0.01em',
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!canSend}
        className="w-8 h-8 flex items-center justify-center rounded-full transition-all shrink-0"
        style={{
          background: canSend ? 'var(--color-accent)' : 'var(--color-gray-200)',
          color: canSend ? '#ffffff' : 'var(--color-gray-400)',
          transform: canSend ? 'scale(1)' : 'scale(0.9)',
          opacity: canSend ? 1 : 0.6,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
        </svg>
      </button>
    </div>
  );
}
