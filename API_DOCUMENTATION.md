# OpenAnalyst API Documentation

## Overview

OpenAnalyst API exposes Claude Code as a REST API with JWT authentication, streaming support (SSE), DeepSeek reasoning integration, and database persistence.

**Base URL:** `http://54.221.126.129:3000` (AWS EC2)

---

## Authentication

### Production Security

In production, token generation requires a `MASTER_API_KEY`:

```bash
POST /api/auth/token
Content-Type: application/json

{
  "userId": "user-123",
  "email": "user@example.com",
  "apiKey": "YOUR_MASTER_API_KEY"  // Required in production
}
```

### POST `/api/auth/token`

Generate a JWT token for API access.

**Request Body:**
```json
{
  "userId": "user-123",
  "email": "user@example.com",
  "apiKey": "your-master-api-key"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2025-12-29T13:25:42.782Z",
    "userId": "user-123"
  }
}
```

### POST `/api/auth/verify`

Verify a JWT token.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "user-123",
    "email": "user@example.com",
    "expiresAt": "2025-12-29T13:25:42.000Z"
  }
}
```

---

## Endpoints Summary

### Public Endpoints (No Auth Required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with database status |
| `/` | GET | API info and endpoint list |
| `/api/auth/token` | POST | Generate JWT token |
| `/api/auth/verify` | POST | Verify JWT token |

### Protected Endpoints (Auth Required)

All `/api/agent/*` endpoints require `Authorization: Bearer <token>` header.

| Endpoint | Method | Response Type | Description |
|----------|--------|---------------|-------------|
| `/api/agent/sdk/chat` | POST | **SSE Stream** | **PRIMARY** - Chat with streaming + reasoning |
| `/api/agent/sdk/chat/tools` | POST | SSE Stream | Submit tool results to continue conversation |
| `/api/agent/sdk/run` | POST | SSE Stream | Agent mode with tool execution |
| `/api/agent/sdk/run-sync` | POST | JSON | Agent mode (blocking) |
| `/api/agent/sdk/continue` | POST | SSE Stream | Continue conversation |
| `/api/agent/sdk/continue-sync` | POST | JSON | Continue (blocking) |
| `/api/agent/run` | POST | SSE Stream | CLI mode with streaming |
| `/api/agent/run-sync` | POST | JSON | CLI mode (blocking) |
| `/api/agent/continue` | POST | SSE Stream | Continue CLI conversation |
| `/api/agent/conversations` | GET | JSON | List user conversations |
| `/api/agent/conversations/:id` | GET | JSON | Get conversation details |
| `/api/agent/conversations/:id/messages` | GET | JSON | Get conversation messages |
| `/api/agent/resumable` | GET | JSON | List resumable conversations |
| `/api/agent/resume/:id` | POST | SSE Stream | Resume conversation by ID |
| `/api/agent/resume/:id/sync` | POST | JSON | Resume (blocking) |
| `/api/agent/usage` | GET | JSON | Get usage statistics |
| `/api/agent/health` | GET | JSON | Agent service health |
| `/api/agent/compact` | POST | JSON | Compact conversation |

---

## Primary Streaming Endpoint (Frontend Focus)

### POST `/api/agent/sdk/chat`

**This is the main endpoint for frontend applications.** Uses Server-Sent Events (SSE) for real-time streaming with support for DeepSeek reasoning/thinking.

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Your question or instruction",
  "projectId": "default",
  "model": "deepseek/deepseek-r1",
  "systemPrompt": "Optional custom system prompt",
  "conversationId": "optional-existing-conversation-id",
  "messages": [
    { "role": "user", "content": "Previous user message" },
    { "role": "assistant", "content": "Previous assistant response" }
  ]
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | The user's message/instruction |
| `projectId` | string | No | Project identifier (default: "default") |
| `model` | string | No | Model to use (see Models section) |
| `systemPrompt` | string | No | Custom system prompt |
| `conversationId` | string | No | Existing conversation to continue |
| `messages` | array | No | Previous conversation history for context |

---

## SSE Event Types (Streaming Response)

The streaming endpoints return Server-Sent Events. Each event is formatted as:

```
data: {"type": "event_type", ...fields}\n\n
```

### Event Types Reference

#### 1. `system` - Session Initialization
Sent immediately when stream starts.

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "session-1734889234567-abc123",
  "mode": "streaming",
  "model": "deepseek/deepseek-r1",
  "useReasoning": true
}
```

#### 2. `stream_start` - Stream Beginning
Confirms stream is active.

```json
{
  "type": "stream_start",
  "message": "Receiving response..."
}
```

#### 3. `thinking` - Reasoning/Thinking Content
**DeepSeek R1 models only.** Shows the model's reasoning process.

```json
{
  "type": "thinking",
  "content": "Let me analyze this problem step by step..."
}
```

**Frontend Display:** Show in a collapsible "Thinking" section with different styling (e.g., gray italic text).

#### 4. `text` - Response Content
The actual response text, streamed token by token.

```json
{
  "type": "text",
  "content": "Here's how to implement"
}
```

**Frontend Display:** Append to main response area. Multiple `text` events form the complete response.

#### 5. `tool_start` - Tool Execution Starting
When the model starts calling a tool.

```json
{
  "type": "tool_start",
  "tool": "Read",
  "tool_use_id": "tool_123456"
}
```

#### 6. `tool_use` - Tool Call Complete
Full tool call details for client-side execution.

```json
{
  "type": "tool_use",
  "tool": "Read",
  "input": {
    "file_path": "/path/to/file.ts"
  },
  "tool_use_id": "tool_123456",
  "execute_locally": true
}
```

**Frontend Handling:** If `execute_locally` is true, the frontend should execute the tool and send results back via `/api/agent/sdk/chat/tools`.

#### 7. `tool_result` - Tool Execution Result
Result from server-side tool execution.

```json
{
  "type": "tool_result",
  "tool": "Read",
  "success": true,
  "output": "file contents...",
  "tool_use_id": "tool_123456"
}
```

#### 8. `usage` - Token Usage Info
Sent near the end of the response.

```json
{
  "type": "usage",
  "tokensInput": 1500,
  "tokensOutput": 2000,
  "costUsd": 0.0024,
  "hasReasoning": true
}
```

#### 9. `turn_complete` - Turn Summary
Sent when model finishes responding.

```json
{
  "type": "turn_complete",
  "sessionId": "session-1734889234567-abc123",
  "model": "deepseek/deepseek-r1",
  "stopReason": "end_turn",
  "needsToolExecution": false,
  "pendingTools": [],
  "tokensInput": 1500,
  "tokensOutput": 2000,
  "costUsd": 0.0024,
  "contentLength": 450,
  "reasoningLength": 320
}
```

**`stopReason` values:**
- `end_turn` - Model finished responding
- `tool_use` - Model wants to use tools (check `pendingTools`)

#### 10. `done` - Stream Complete
Final event, stream is closing.

```json
{
  "type": "done",
  "sessionId": "session-1734889234567-abc123"
}
```

#### 11. `error` - Error Occurred
Sent if an error occurs.

```json
{
  "type": "error",
  "content": "Error message describing what went wrong"
}
```

---

## Frontend Integration Guide

### TypeScript/JavaScript SSE Client

```typescript
interface SSEEvent {
  type: 'system' | 'stream_start' | 'thinking' | 'text' | 'tool_use' |
        'tool_result' | 'usage' | 'turn_complete' | 'done' | 'error';
  [key: string]: unknown;
}

async function streamChat(prompt: string, token: string) {
  const response = await fetch('http://54.221.126.129:3000/api/agent/sdk/chat', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      projectId: 'default',
      model: 'deepseek/deepseek-r1',
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let thinkingContent = '';
  let responseContent = '';
  let sessionId = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event: SSEEvent = JSON.parse(data);

        switch (event.type) {
          case 'system':
            sessionId = event.session_id as string;
            console.log('Session started:', sessionId);
            break;

          case 'thinking':
            thinkingContent += event.content;
            // Update thinking UI (collapsible section)
            updateThinkingUI(event.content as string);
            break;

          case 'text':
            responseContent += event.content;
            // Append to main response area
            appendToResponse(event.content as string);
            break;

          case 'tool_use':
            // Show tool being used
            showToolExecution(event.tool as string, event.input);
            break;

          case 'usage':
            // Update token counter UI
            updateUsageUI(event.tokensInput as number, event.tokensOutput as number);
            break;

          case 'turn_complete':
            // Check if tools need execution
            if (event.needsToolExecution) {
              console.log('Pending tools:', event.pendingTools);
              // Handle tool execution if needed
            }
            break;

          case 'done':
            console.log('Stream complete');
            break;

          case 'error':
            console.error('Error:', event.content);
            showErrorUI(event.content as string);
            break;
        }
      } catch (e) {
        // Skip malformed JSON
      }
    }
  }

  return { thinkingContent, responseContent, sessionId };
}
```

### React Hook Example

```typescript
import { useState, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

export function useChat(token: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState('');
  const [sessionId, setSessionId] = useState('');

  const sendMessage = useCallback(async (prompt: string) => {
    setIsStreaming(true);
    setThinking('');

    // Add user message
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);

    // Initialize assistant message
    let assistantContent = '';
    let thinkingContent = '';

    setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: '' }]);

    try {
      const response = await fetch('http://54.221.126.129:3000/api/agent/sdk/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: 'deepseek/deepseek-r1',
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);

            if (event.type === 'system') {
              setSessionId(event.session_id);
            } else if (event.type === 'thinking') {
              thinkingContent += event.content;
              setThinking(thinkingContent);
              // Update last message's thinking
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].thinking = thinkingContent;
                return updated;
              });
            } else if (event.type === 'text') {
              assistantContent += event.content;
              // Update last message's content
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content = assistantContent;
                return updated;
              });
            }
          } catch {}
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, [token, messages]);

  return { messages, sendMessage, isStreaming, thinking, sessionId };
}
```

### Tool Result Submission

If the model requests tool execution (`execute_locally: true`), submit results:

```typescript
async function submitToolResults(
  sessionId: string,
  toolResults: Array<{ tool_use_id: string; output: string; is_error: boolean }>,
  token: string
) {
  const response = await fetch('http://54.221.126.129:3000/api/agent/sdk/chat/tools', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      toolResults,
      projectId: 'default',
    }),
  });

  // Returns another SSE stream with the model's response to tool results
  return response;
}
```

---

## Available Models

| Model | ID | Best For | Reasoning |
|-------|-----|----------|-----------|
| DeepSeek R1 | `deepseek/deepseek-r1` | Complex tasks with thinking | Yes |
| DeepSeek V3.2 | `deepseek/deepseek-v3.2` | Balanced performance | Yes |
| DeepSeek V3 | `deepseek/deepseek-chat-v3-0324` | Fast, no reasoning | No |
| Claude Opus 4.1 | `anthropic/claude-opus-4.1` | Complex reasoning | No |
| Claude Sonnet 4.5 | `anthropic/claude-sonnet-4.5` | General coding | No |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | Fast, simple tasks | No |

**Default:** `deepseek/deepseek-r1` (includes reasoning/thinking)

---

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `NOT_FOUND` | 404 | Resource not found |
| `NO_SESSION` | 400 | Conversation has no session to resume |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `CONFIG_ERROR` | 500 | Server misconfiguration |
| `AGENT_ERROR` | 500 | Agent execution failed |
| `DATABASE_ERROR` | 500 | Database operation failed |

---

## Rate Limiting

- **Window:** 60 seconds
- **Max Requests:** 100 per window per IP
- **Agent Execution:** Additional limits may apply
- **Headers:** Standard `X-RateLimit-*` headers included

---

## cURL Examples

### Get Token (Development)
```bash
curl -X POST http://54.221.126.129:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "test-user", "email": "test@example.com"}'
```

### Get Token (Production)
```bash
curl -X POST http://54.221.126.129:3000/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "email": "test@example.com",
    "apiKey": "YOUR_MASTER_API_KEY"
  }'
```

### Chat with Streaming
```bash
curl -N -X POST http://54.221.126.129:3000/api/agent/sdk/chat \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain how React hooks work",
    "model": "deepseek/deepseek-r1"
  }'
```

### Health Check
```bash
curl http://54.221.126.129:3000/health
```

---

## Tools Available

Tools that the AI can use during conversations:

| Tool | Description | Category |
|------|-------------|----------|
| `Read` | Read file contents | Safe |
| `Glob` | Find files by pattern | Safe |
| `Grep` | Search file contents | Safe |
| `WebSearch` | Search the web | Safe |
| `WebFetch` | Fetch web content | Safe |
| `Write` | Create new files | Dangerous |
| `Edit` | Modify existing files | Dangerous |
| `Bash` | Run shell commands | Dangerous |

**Default allowed:** Safe tools only (`Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`)

---

## Security Notes

1. **MASTER_API_KEY** is required for token generation in production
2. **JWT_SECRET** must be set (server fails to start without it)
3. **Tool permissions** default to safe read-only tools
4. **Dangerous commands** are blocklisted (rm -rf, format, etc.)

---

## Support

- GitHub Issues: https://github.com/anthropics/claude-code/issues
- Documentation: This file and `/docs` folder
