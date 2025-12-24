# Phase 5: Frontend & User Interface

## Objective
Build the Next.js frontend that users interact with, connecting to Brain via WebSocket.

## Tech Stack
- Next.js 14+ (App Router)
- TypeScript
- Tailwind CSS
- WebSocket for real-time communication
- React Query for data fetching

## Tasks

### 5.1 Project Setup
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
npm install socket.io-client @tanstack/react-query zustand
```

### 5.2 Directory Structure
```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── workflows/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   └── settings/
│   │       └── page.tsx
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   └── TypingIndicator.tsx
│   │   ├── workflows/
│   │   │   ├── WorkflowList.tsx
│   │   │   ├── WorkflowCard.tsx
│   │   │   └── WorkflowBuilder.tsx
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Footer.tsx
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Input.tsx
│   │       └── Card.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useChat.ts
│   │   └── useWorkflows.ts
│   ├── lib/
│   │   ├── websocket.ts
│   │   ├── api.ts
│   │   └── utils.ts
│   ├── store/
│   │   ├── chatStore.ts
│   │   └── userStore.ts
│   └── types/
│       └── index.ts
├── public/
├── tailwind.config.ts
└── package.json
```

### 5.3 WebSocket Connection
**File**: `frontend/src/lib/websocket.ts`

```typescript
import { io, Socket } from 'socket.io-client';

export interface WSMessage {
  type: string;
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
}

class WebSocketClient {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(userId: string, sessionId: string): void {
    if (this.socket?.connected) return;

    this.socket = io(process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8002', {
      auth: { userId, sessionId },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    this.socket.on('message', (message: WSMessage) => {
      this.notifyListeners(message.type, message.payload);
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }

  send(type: string, payload: unknown): void {
    if (!this.socket?.connected) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit('message', { type, payload });
  }

  subscribe(type: string, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  private notifyListeners(type: string, data: unknown): void {
    this.listeners.get(type)?.forEach(cb => cb(data));
    this.listeners.get('*')?.forEach(cb => cb({ type, data }));
  }
}

export const wsClient = new WebSocketClient();
```

### 5.4 Chat Hook
**File**: `frontend/src/hooks/useChat.ts`

```typescript
import { useEffect, useState, useCallback } from 'react';
import { wsClient } from '@/lib/websocket';
import { useChatStore } from '@/store/chatStore';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'sending' | 'sent' | 'error';
}

export function useChat() {
  const { messages, addMessage, updateMessage } = useChatStore();
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    const unsubscribe = wsClient.subscribe('ASSISTANT_RESPONSE', (data) => {
      const response = data as { messageId: string; content: string; done: boolean };
      
      if (response.done) {
        setIsTyping(false);
        updateMessage(response.messageId, { status: 'sent' });
      } else {
        // Streaming response
        updateMessage(response.messageId, { 
          content: response.content,
          status: 'sending' 
        });
      }
    });

    return unsubscribe;
  }, [updateMessage]);

  const sendMessage = useCallback(async (content: string) => {
    const messageId = `msg-${Date.now()}`;
    
    // Add user message
    addMessage({
      id: messageId,
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'sent'
    });

    // Add placeholder for assistant response
    const assistantMsgId = `msg-${Date.now() + 1}`;
    addMessage({
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'sending'
    });

    setIsTyping(true);

    // Send to Brain via WebSocket
    wsClient.send('USER_REQUEST', {
      messageId,
      assistantMsgId,
      content
    });
  }, [addMessage]);

  return {
    messages,
    sendMessage,
    isTyping
  };
}
```

### 5.5 Chat Store
**File**: `frontend/src/store/chatStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Message } from '@/hooks/useChat';

interface ChatState {
  messages: Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      messages: [],
      
      addMessage: (message) => set((state) => ({
        messages: [...state.messages, message]
      })),
      
      updateMessage: (id, updates) => set((state) => ({
        messages: state.messages.map((msg) =>
          msg.id === id ? { ...msg, ...updates } : msg
        )
      })),
      
      clearMessages: () => set({ messages: [] })
    }),
    {
      name: 'chat-storage'
    }
  )
);
```

### 5.6 Chat Components
**File**: `frontend/src/components/chat/ChatWindow.tsx`

```typescript
'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@/hooks/useChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';

export function ChatWindow() {
  const { messages, sendMessage, isTyping } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4">
        <MessageList messages={messages} />
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-4">
        <MessageInput onSend={sendMessage} disabled={isTyping} />
      </div>
    </div>
  );
}
```

**File**: `frontend/src/components/chat/MessageList.tsx`

```typescript
import { Message } from '@/hooks/useChat';
import { cn } from '@/lib/utils';

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'flex',
            message.role === 'user' ? 'justify-end' : 'justify-start'
          )}
        >
          <div
            className={cn(
              'max-w-[80%] rounded-lg px-4 py-2',
              message.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
            )}
          >
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.status === 'sending' && (
              <span className="text-xs opacity-50">...</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

**File**: `frontend/src/components/chat/MessageInput.tsx`

```typescript
import { useState, KeyboardEvent } from 'react';

interface MessageInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2">
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={1}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !input.trim()}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  );
}
```

### 5.7 Dashboard Page
**File**: `frontend/src/app/dashboard/page.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { Sidebar } from '@/components/layout/Sidebar';
import { wsClient } from '@/lib/websocket';
import { useUserStore } from '@/store/userStore';

export default function DashboardPage() {
  const { userId, sessionId } = useUserStore();

  useEffect(() => {
    // Connect WebSocket on mount
    wsClient.connect(userId, sessionId);

    return () => {
      wsClient.disconnect();
    };
  }, [userId, sessionId]);

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <header className="border-b p-4">
          <h1 className="text-xl font-semibold">OpenAnalyst</h1>
        </header>
        <div className="flex-1">
          <ChatWindow />
        </div>
      </main>
    </div>
  );
}
```

### 5.8 Workflow Components
**File**: `frontend/src/components/workflows/WorkflowList.tsx`

```typescript
'use client';

import { useWorkflows } from '@/hooks/useWorkflows';
import { WorkflowCard } from './WorkflowCard';

export function WorkflowList() {
  const { workflows, isLoading } = useWorkflows();

  if (isLoading) {
    return <div className="animate-pulse">Loading workflows...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {workflows.map((workflow) => (
        <WorkflowCard key={workflow.id} workflow={workflow} />
      ))}
    </div>
  );
}
```

## Testing

### Component Tests
```typescript
// __tests__/components/ChatWindow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatWindow } from '@/components/chat/ChatWindow';

describe('ChatWindow', () => {
  it('renders message input', () => {
    render(<ChatWindow />);
    expect(screen.getByPlaceholder(/type your message/i)).toBeInTheDocument();
  });

  it('sends message on button click', () => {
    render(<ChatWindow />);
    const input = screen.getByPlaceholder(/type your message/i);
    const button = screen.getByRole('button', { name: /send/i });
    
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(button);
    
    expect(input).toHaveValue('');
  });
});
```

## Checkpoint
Before proceeding to Phase 6:
- [ ] Next.js app running
- [ ] WebSocket connection working
- [ ] Chat interface functional
- [ ] Messages flowing to Brain and back
- [ ] Basic styling complete

## Next Phase
Proceed to [Phase 6: Integration & Testing](./PHASE-6-integration.md)
