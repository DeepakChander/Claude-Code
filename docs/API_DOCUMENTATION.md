# OpenAnalyst API Documentation

**Base URL:** `http://16.171.8.128:3456`

---

## Table of Contents

1. [Authentication](#authentication)
2. [Agent Endpoints (SDK Mode)](#agent-endpoints-sdk-mode)
3. [Conversation Management](#conversation-management)
4. [Utility Endpoints](#utility-endpoints)
5. [Server-Sent Events (SSE) Streaming](#server-sent-events-sse-streaming)
6. [Error Handling](#error-handling)

---

## Authentication

All agent endpoints require a JWT Bearer token in the `Authorization` header.

### Generate Token

```
POST /api/auth/token
```

**Description:** Generate a JWT token for API access (valid for 7 days).

**Request Body:**
```json
{
  "userId": "string (required) - Unique user identifier",
  "email": "string (optional) - User email"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2025-12-28T09:00:00.000Z",
    "userId": "user-123"
  }
}
```

**Example:**
```bash
curl -X POST http://16.171.8.128:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-123", "email": "user@example.com"}'
```

---

### Verify Token

```
POST /api/auth/verify
```

**Description:** Validate a JWT token and get user info.

**Request Body:**
```json
{
  "token": "string (required) - JWT token to verify"
}
```

**Response (Valid):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "user-123",
    "email": "user@example.com",
    "expiresAt": "2025-12-28T09:00:00.000Z"
  }
}
```

**Response (Invalid):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "error": "jwt expired"
  }
}
```

---

## Agent Endpoints (SDK Mode)

These endpoints use Claude AI via OpenRouter with **tool use support**. Claude can create, read, edit files and execute bash commands.

### Available Tools

The API provides Claude with these tools:
- **Read** - Read file contents
- **Write** - Create/overwrite files
- **Edit** - Replace text in files
- **Bash** - Execute shell commands
- **Glob** - Find files by pattern
- **Grep** - Search file contents

---

### Run Agent (Streaming)

```
POST /api/agent/sdk/run
```

**Description:** Execute a prompt with streaming output via Server-Sent Events (SSE). Claude will use tools as needed.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "string (required) - The instruction for Claude",
  "projectId": "string (optional) - Project identifier, default: 'default'",
  "model": "string (optional) - Model to use, default: 'anthropic/claude-sonnet-4.5'",
  "systemPrompt": "string (optional) - Custom system prompt",
  "maxTurns": "number (optional) - Max agentic loop iterations, default: 20",
  "allowedTools": ["string"] (optional) - Restrict to specific tools",
  "conversationId": "string (optional) - Resume existing conversation"
}
```

**Response:** SSE Stream (see [SSE Streaming](#server-sent-events-sse-streaming))

**Example:**
```bash
curl -N -X POST http://16.171.8.128:3456/api/agent/sdk/run \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a file named hello.py with a Hello World program", "projectId": "my-project"}'
```

---

### Run Agent (Synchronous)

```
POST /api/agent/sdk/run-sync
```

**Description:** Execute a prompt and wait for complete response (JSON).

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "string (required)",
  "projectId": "string (optional)",
  "model": "string (optional)",
  "systemPrompt": "string (optional)",
  "maxTurns": "number (optional)",
  "allowedTools": ["string"] (optional),
  "conversationId": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "I've created hello.py with a simple Hello World program...",
    "conversationId": "abc123-def456-...",
    "sessionId": "session-1234567890-abc123",
    "usage": {
      "tokensInput": 1500,
      "tokensOutput": 200,
      "costUsd": 0.0055
    }
  }
}
```

**Example:**
```bash
curl -X POST http://16.171.8.128:3456/api/agent/sdk/run-sync \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What files are in the current directory?", "projectId": "my-project"}'
```

---

### Continue Conversation (Streaming)

```
POST /api/agent/sdk/continue
```

**Description:** Continue an existing conversation with memory of previous messages.

**Request Body:**
```json
{
  "prompt": "string (required)",
  "projectId": "string (optional)",
  "conversationId": "string (optional) - Specific conversation to continue"
}
```

**Response:** SSE Stream

---

### Continue Conversation (Synchronous)

```
POST /api/agent/sdk/continue-sync
```

**Description:** Continue conversation and wait for complete response.

**Request Body:**
```json
{
  "prompt": "string (required)",
  "projectId": "string (optional)",
  "conversationId": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Based on our previous conversation...",
    "conversationId": "abc123-def456-...",
    "sessionId": "session-1234567890-abc123",
    "usage": {
      "tokensInput": 2500,
      "tokensOutput": 300,
      "costUsd": 0.0095
    }
  }
}
```

---

## Conversation Management

### List Conversations

```
GET /api/agent/conversations
```

**Description:** Get all conversations for the authenticated user.

**Query Parameters:**
- `archived` (boolean) - Include archived conversations
- `limit` (number) - Max results to return
- `offset` (number) - Pagination offset

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "conversationId": "abc123-...",
      "title": "Python Hello World",
      "sessionId": "session-123...",
      "modelUsed": "anthropic/claude-sonnet-4.5",
      "messageCount": 5,
      "totalTokensUsed": 3500,
      "totalCostUsd": 0.015,
      "lastMessageAt": "2025-12-21T10:00:00Z",
      "createdAt": "2025-12-21T09:00:00Z"
    }
  ]
}
```

---

### Get Conversation Details

```
GET /api/agent/conversations/:conversationId
```

**Description:** Get detailed info about a specific conversation.

**Response:**
```json
{
  "success": true,
  "data": {
    "conversationId": "abc123-...",
    "title": "Python Hello World",
    "workspacePath": "/tmp/claude-agent-workspaces/user-123/my-project",
    "sessionId": "session-123...",
    "modelUsed": "anthropic/claude-sonnet-4.5",
    "isArchived": false,
    "isPinned": false,
    "totalTokensUsed": 3500,
    "totalCostUsd": 0.015,
    "messageCount": 5,
    "tags": ["python", "tutorial"],
    "canResume": true,
    "lastMessageAt": "2025-12-21T10:00:00Z",
    "createdAt": "2025-12-21T09:00:00Z"
  }
}
```

---

### Get Conversation Messages

```
GET /api/agent/conversations/:conversationId/messages
```

**Description:** Get all messages in a conversation.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "messageId": "msg-123",
      "role": "user",
      "content": "Create a hello world Python file",
      "createdAt": "2025-12-21T09:00:00Z"
    },
    {
      "messageId": "msg-124",
      "role": "assistant",
      "content": "I've created hello.py with a Hello World program...",
      "tokensInput": 1500,
      "tokensOutput": 200,
      "costUsd": 0.0055,
      "createdAt": "2025-12-21T09:00:05Z"
    }
  ]
}
```

---

### List Resumable Conversations

```
GET /api/agent/resumable
```

**Description:** Get conversations that have a session ID and can be resumed.

**Query Parameters:**
- `limit` (number)
- `offset` (number)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "conversationId": "abc123-...",
      "title": "Python Project",
      "sessionId": "session-123...",
      "workspacePath": "my-project",
      "modelUsed": "anthropic/claude-sonnet-4.5",
      "messageCount": 10,
      "lastMessageAt": "2025-12-21T10:00:00Z"
    }
  ]
}
```

---

### Resume Conversation (Streaming)

```
POST /api/agent/resume/:conversationId
```

**Description:** Resume a specific conversation by ID with streaming output.

**Request Body:**
```json
{
  "prompt": "string (required)"
}
```

**Response:** SSE Stream

---

### Resume Conversation (Synchronous)

```
POST /api/agent/resume/:conversationId/sync
```

**Request Body:**
```json
{
  "prompt": "string (required)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Continuing from where we left off...",
    "conversationId": "abc123-...",
    "sessionId": "session-123..."
  }
}
```

---

## Utility Endpoints

### Health Check (Public)

```
GET /health
```

**Description:** Check if the API is running.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "environment": "production",
  "version": "2.0.0"
}
```

---

### Agent Health Check

```
GET /api/agent/health
```

**Description:** Check OpenRouter connection status (requires auth).

**Response:**
```json
{
  "success": true,
  "data": {
    "openrouter": "connected",
    "configured": true,
    "mode": "sdk"
  }
}
```

---

### Get Usage Statistics

```
GET /api/agent/usage
```

**Description:** Get token usage and cost for a project.

**Query Parameters:**
- `projectId` (string) - Project ID, default: 'default'

**Response:**
```json
{
  "success": true,
  "data": {
    "tokensInput": 50000,
    "tokensOutput": 10000,
    "costUsd": 0.25,
    "messageCount": 50
  }
}
```

---

### Compact Conversation

```
POST /api/agent/compact
```

**Description:** Summarize conversation to reduce context size (placeholder - returns estimate).

**Request Body:**
```json
{
  "projectId": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "Conversation with 20 messages about: Python development",
    "tokensSaved": 5000,
    "message": "Compact feature will use Claude to summarize in a future update"
  }
}
```

---

## Server-Sent Events (SSE) Streaming

Streaming endpoints return SSE with the following event types:

### Event Format
```
data: {"type": "...", ...}\n\n
```

### Event Types

| Type | Description | Fields |
|------|-------------|--------|
| `system` | Session initialized | `subtype`, `session_id` |
| `text` | Text content from Claude | `content` |
| `tool_use` | Claude is calling a tool | `tool`, `input`, `tool_use_id` |
| `tool_result` | Tool execution result | `tool`, `success`, `output`, `error` |
| `usage` | Token usage stats | `tokensInput`, `tokensOutput`, `costUsd`, `turns` |
| `done` | Stream complete | `sessionId`, `model`, `tokensInput`, `tokensOutput`, `costUsd` |
| `error` | Error occurred | `content` |

### Example Stream

```
data: {"type":"system","subtype":"init","session_id":"session-123"}\n\n
data: {"type":"text","content":"I'll create that file for you."}\n\n
data: {"type":"tool_use","tool":"Write","input":{"file_path":"hello.py","content":"print('Hello')"}}\n\n
data: {"type":"tool_result","tool":"Write","success":true,"output":"File written: hello.py"}\n\n
data: {"type":"text","content":"Done! I've created hello.py."}\n\n
data: {"type":"usage","tokensInput":1500,"tokensOutput":100,"costUsd":0.005}\n\n
data: {"type":"done","sessionId":"session-123","model":"anthropic/claude-sonnet-4.5"}\n\n
```

### JavaScript SSE Client Example

```javascript
const eventSource = new EventSource('/api/agent/sdk/run', {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Note: EventSource doesn't support POST, use fetch instead:
async function streamRequest(prompt) {
  const response = await fetch('/api/agent/sdk/run', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, projectId: 'default' })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        handleEvent(event);
      }
    }
  }
}

function handleEvent(event) {
  switch (event.type) {
    case 'text':
      console.log(event.content);
      break;
    case 'tool_use':
      console.log(`Using tool: ${event.tool}`);
      break;
    case 'tool_result':
      console.log(`Tool result: ${event.output}`);
      break;
    case 'done':
      console.log('Complete!');
      break;
    case 'error':
      console.error(event.content);
      break;
  }
}
```

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

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `NOT_FOUND` | 404 | Resource not found |
| `NO_SESSION` | 400 | Conversation has no session to resume |
| `AGENT_ERROR` | 500 | Claude API error |
| `DATABASE_ERROR` | 500 | MongoDB error |
| `TOKEN_GENERATION_ERROR` | 500 | Failed to generate JWT |

---

## Models Available

| Model | Description | Cost (per 1M tokens) |
|-------|-------------|---------------------|
| `anthropic/claude-opus-4.1` | Most capable | $15 input / $75 output |
| `anthropic/claude-sonnet-4.5` | Balanced (default) | $3 input / $15 output |
| `anthropic/claude-haiku-4.5` | Fastest, cheapest | $0.25 input / $1.25 output |

---

## Rate Limits

- 20 requests per minute per user
- 200 requests per hour per user
- 1 million tokens per day per user

---

## Workspace Isolation

Each user/project combination has an isolated workspace:
```
/tmp/claude-agent-workspaces/{userId}/{projectId}/
```

Files created by Claude are stored here and persist between requests within the same project.

---

## Quick Start

1. **Get a token:**
```bash
curl -X POST http://16.171.8.128:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "my-user-id"}'
```

2. **Run a prompt:**
```bash
curl -X POST http://16.171.8.128:3456/api/agent/sdk/run-sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a simple Python calculator", "projectId": "calculator"}'
```

3. **Continue the conversation:**
```bash
curl -X POST http://16.171.8.128:3456/api/agent/sdk/continue-sync \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Add a division function", "projectId": "calculator"}'
```
