'use client';

import { useState, useCallback } from 'react';
import { Message, WSMessage } from '@/types';
import { useWebSocket } from './useWebSocket';

interface UseChatOptions {
  token: string;
  onError?: (error: string) => void;
}

interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  isConnected: boolean;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const { token, onError } = options;

  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);

  const handleMessage = useCallback((wsMessage: WSMessage) => {
    switch (wsMessage.type) {
      case 'ASSISTANT_TYPING':
        setIsLoading(true);
        break;

      case 'ASSISTANT_CHUNK': {
        const chunkPayload = wsMessage.payload as { content: string };
        if (currentMessageId) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentMessageId
                ? { ...msg, content: msg.content + chunkPayload.content }
                : msg
            )
          );
        }
        break;
      }

      case 'ASSISTANT_RESPONSE': {
        const responsePayload = wsMessage.payload as {
          messageId: string;
          content: string;
          done: boolean;
          metadata?: Record<string, unknown>;
        };

        if (responsePayload.done) {
          setIsLoading(false);
          setCurrentMessageId(null);

          // Update or add the final message
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === currentMessageId);
            if (existingIndex >= 0) {
              return prev.map((msg, i) =>
                i === existingIndex
                  ? {
                      ...msg,
                      content: responsePayload.content || msg.content,
                      metadata: responsePayload.metadata as Message['metadata'],
                    }
                  : msg
              );
            }
            return [
              ...prev,
              {
                id: responsePayload.messageId,
                role: 'assistant',
                content: responsePayload.content,
                timestamp: wsMessage.timestamp,
                metadata: responsePayload.metadata as Message['metadata'],
              },
            ];
          });
        }
        break;
      }

      case 'ERROR': {
        setIsLoading(false);
        const errorPayload = wsMessage.payload as { message: string };
        onError?.(errorPayload.message);
        break;
      }
    }
  }, [currentMessageId, onError]);

  const { isConnected, sendMessage: wsSend } = useWebSocket({
    token,
    onMessage: handleMessage,
  });

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;

      // Add user message
      const userMessage: Message = {
        id: `msg_${Date.now()}_user`,
        role: 'user',
        content,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMessageId = `msg_${Date.now()}_assistant`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setCurrentMessageId(assistantMessageId);

      // Send via WebSocket
      setIsLoading(true);
      wsSend('USER_REQUEST', { content });
    },
    [wsSend]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setCurrentMessageId(null);
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    isConnected,
    sendMessage,
    clearMessages,
  };
}
