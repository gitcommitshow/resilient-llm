'use client';

import { memo } from 'react';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function ChatMessage({ role, content }: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center animate-slide-up">
        <div
          className="px-3 py-1.5 rounded-full text-xs"
          style={{
            background: 'var(--color-gray-100)',
            color: 'var(--color-gray-500)',
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex animate-slide-up ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`bubble ${isUser ? 'bubble-user' : 'bubble-assistant'}`}
        style={{
          wordBreak: 'break-word',
        }}
      >
        <div className="whitespace-pre-wrap">
          {content}
        </div>
      </div>
    </div>
  );
}

export default memo(ChatMessage);
