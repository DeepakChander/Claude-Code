'use client';

import { Message } from '@/types';
import ReactMarkdown from 'react-markdown';

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? 'bg-primary-600 text-white'
            : 'bg-gray-100 text-gray-900'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{message.content || '...'}</ReactMarkdown>
          </div>
        )}

        {message.metadata && (
          <div className="mt-2 pt-2 border-t border-gray-200/20 text-xs opacity-70">
            {message.metadata.skill && (
              <span className="mr-2">Skill: {message.metadata.skill}</span>
            )}
            {message.metadata.duration && (
              <span>Time: {(message.metadata.duration / 1000).toFixed(1)}s</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
