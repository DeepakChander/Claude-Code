# OpenAnalyst API Documentation

**Version:** 2.0.0
**Base URL:** `https://api.openanalyst.com`
**Last Updated:** December 2024

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Authentication](#authentication)
3. [Making Your First Request](#making-your-first-request)
4. [Response Format](#response-format)
5. [Error Codes](#error-codes)
6. [Endpoints Reference](#endpoints-reference)
   - [Health & Status](#health--status)
   - [Authentication](#authentication-endpoints)
   - [Agent Endpoints](#agent-endpoints)
   - [Conversation Endpoints](#conversation-endpoints)
   - [Skills Endpoints](#skills-endpoints)
   - [Search Endpoints](#search-endpoints)
   - [Pending Responses](#pending-responses-endpoints)
7. [Streaming (SSE)](#streaming-sse)
8. [WebSocket Connection](#websocket-connection)
9. [Complete Code Examples](#complete-code-examples)

---

## Getting Started

### What You Need

1. **API Key:** `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
2. **Base URL:** `https://api.openanalyst.com`
3. **HTTP Client:** fetch, axios, or any HTTP library

### Quick Test

Run this command in your terminal to verify the API is working:

```bash
curl -X GET "https://api.openanalyst.com/health"
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-26T10:00:00.000Z",
  "version": "2.0.0",
  "service": "openanalyst-api"
}
```

---

## Authentication

### How Authentication Works

All protected endpoints require the `X-API-Key` header. Add this header to every request:

```
X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1
```

### Which Endpoints Require Authentication?

| Endpoint Pattern | Authentication Required? |
|------------------|-------------------------|
| `GET /health` | NO |
| `GET /` | NO |
| `/api/auth/*` | NO (but needs API key in body for token generation) |
| `/api/agent/*` | YES |
| `/api/skills/*` | NO |
| `/api/search/*` | NO |
| `/api/pending-responses/*` | YES |

---

## Making Your First Request

### Step 1: Basic Health Check (No Auth Required)

```javascript
// JavaScript/TypeScript
const response = await fetch('https://api.openanalyst.com/health');
const data = await response.json();
console.log(data);
```

### Step 2: Authenticated Request

```javascript
// JavaScript/TypeScript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

const response = await fetch('https://api.openanalyst.com/api/agent/health', {
  method: 'GET',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);
```

### Step 3: Send a Query to the Agent

```javascript
// JavaScript/TypeScript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

const response = await fetch('https://api.openanalyst.com/api/agent/run-sync', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'What is the capital of France?'
  })
});

const data = await response.json();
console.log(data);
```

---

## Response Format

### Success Response

All successful responses follow this format:

```json
{
  "success": true,
  "data": {
    // Response data here
  }
}
```

### Error Response

All error responses follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message"
  }
}
```

---

## Error Codes

| HTTP Status | Error Code | Description | How to Fix |
|-------------|------------|-------------|------------|
| 400 | `VALIDATION_ERROR` | Missing or invalid request parameters | Check required fields |
| 401 | `UNAUTHORIZED` | Missing or invalid API key | Add X-API-Key header |
| 404 | `NOT_FOUND` | Resource not found | Check the endpoint URL |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry |
| 500 | `INTERNAL_ERROR` | Server error | Contact support |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily unavailable | Retry later |

---

## Endpoints Reference

---

### Health & Status

#### GET /health

Check if the API server is running.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/health')
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-12-26T10:00:00.000Z",
  "version": "2.0.0",
  "service": "openanalyst-api",
  "environment": "production",
  "database": {
    "type": "mongodb",
    "connected": true
  },
  "kafka": {
    "configured": false,
    "producer": "disconnected",
    "consumer": "stopped"
  },
  "websocket": {
    "enabled": true,
    "path": "/ws",
    "connectedClients": 0
  },
  "features": {
    "resumeConversation": true,
    "offlineDelivery": true,
    "messageQueue": false,
    "taskProgress": true
  }
}
```

---

#### GET /

Get API information and available endpoints.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/')
```

**Response:**
```json
{
  "message": "OpenAnalyst API - Claude Code on AWS",
  "version": "2.0.0",
  "documentation": "/api",
  "endpoints": {
    "health": "GET /health",
    "auth": {
      "token": "POST /api/auth/token",
      "verify": "POST /api/auth/verify"
    },
    "agent": {
      "run": "POST /api/agent/run (SSE streaming)",
      "runSync": "POST /api/agent/run-sync (JSON)"
    }
  }
}
```

---

### Authentication Endpoints

#### POST /api/auth/token

Generate a JWT token for authentication.

**Authentication:** Requires API key in request body

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/auth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user123',
    email: 'user@example.com',
    apiKey: '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | YES | Unique user identifier |
| `email` | string | NO | User email address |
| `apiKey` | string | YES | Master API key |

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2025-01-02T10:00:00.000Z",
    "userId": "user123"
  }
}
```

---

#### POST /api/auth/verify

Verify if a JWT token is valid.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/auth/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | YES | JWT token to verify |

**Response (Valid Token):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "user123",
    "email": "user@example.com",
    "expiresAt": "2025-01-02T10:00:00.000Z"
  }
}
```

**Response (Invalid Token):**
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

### Agent Endpoints

#### POST /api/agent/run-sync

Run the AI agent and get a JSON response. This is the **recommended endpoint** for most use cases.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/run-sync', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Explain what React hooks are'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | YES | The question or task for the agent |
| `projectId` | string | NO | Project identifier (default: "default") |
| `model` | string | NO | AI model to use |
| `systemPrompt` | string | NO | Custom system instructions |
| `maxTurns` | number | NO | Maximum conversation turns |
| `allowedTools` | string[] | NO | List of tools the agent can use |

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "React hooks are functions that allow you to use state and other React features in functional components...",
    "conversationId": "conv_abc123",
    "sessionId": "session_xyz789"
  }
}
```

---

#### POST /api/agent/run

Run the AI agent with **streaming output** (Server-Sent Events).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

const response = await fetch('https://api.openanalyst.com/api/agent/run', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Write a Python function to sort a list'
  })
});

// Handle streaming response
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value);
  console.log(text); // Prints chunks as they arrive
}
```

**Request Body:** Same as `/api/agent/run-sync`

**Response:** Server-Sent Events (SSE) stream with chunks of text.

---

#### POST /api/agent/continue

Continue an existing conversation.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/continue', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Now add error handling to that function',
    conversationId: 'conv_abc123'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | YES | Follow-up question or task |
| `conversationId` | string | NO | Conversation to continue |
| `projectId` | string | NO | Project identifier |

---

#### POST /api/agent/sdk/run-sync

Run the agent using SDK mode (synchronous).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/sdk/run-sync', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Analyze this code for bugs',
    model: 'claude-3-opus'
  })
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Analysis complete. I found the following issues...",
    "conversationId": "conv_abc123",
    "sessionId": "session_xyz789",
    "usage": {
      "tokensInput": 150,
      "tokensOutput": 450,
      "costUsd": 0.0025
    }
  }
}
```

---

#### POST /api/agent/sdk/run

Run the agent using SDK mode with **streaming output**.

**Authentication:** REQUIRED

**Request Body:** Same as `/api/agent/sdk/run-sync`

**Response:** Server-Sent Events (SSE) stream.

---

#### POST /api/agent/sdk/continue

Continue a conversation using SDK session resume (streaming).

**Authentication:** REQUIRED

---

#### POST /api/agent/sdk/continue-sync

Continue a conversation using SDK session resume (synchronous).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/sdk/continue-sync', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Add unit tests for the previous code',
    conversationId: 'conv_abc123'
  })
})
```

---

#### POST /api/agent/sdk/chat

Chat mode - returns tool_use for client-side execution.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/sdk/chat', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Read the package.json file',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi! How can I help?' }
    ],
    clientSkills: [
      {
        name: 'read-file',
        description: 'Read a file from the filesystem',
        content: 'Read file contents'
      }
    ]
  })
})
```

---

#### POST /api/agent/sdk/chat/tools

Submit tool results from client and continue conversation.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/sdk/chat/tools', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId: 'session_xyz789',
    toolResults: [
      {
        tool_use_id: 'tool_123',
        output: '{"name": "my-project", "version": "1.0.0"}',
        is_error: false
      }
    ]
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | YES | Session ID from previous response |
| `toolResults` | array | YES | Array of tool results |
| `toolResults[].tool_use_id` | string | YES | Tool use ID from agent |
| `toolResults[].output` | string | YES | Tool execution result |
| `toolResults[].is_error` | boolean | YES | Whether tool execution failed |

---

#### POST /api/agent/orchestrate

Orchestrated request - automatically routes to the best handler.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/orchestrate', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Search the web for latest React news'
  })
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Here are the latest React news...",
    "conversationId": "conv_abc123",
    "routedTo": "agno",
    "skill": "web-search",
    "taskId": "task_456",
    "executionTime": 2500
  }
}
```

---

#### GET /api/agent/health

Check agent service health.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/health', {
  headers: { 'X-API-Key': API_KEY }
})
```

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

#### GET /api/agent/skills

Get available skills and routing configuration.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/skills', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "skills": [
      {
        "name": "web-search",
        "description": "Search the web"
      }
    ],
    "agnoAvailable": true
  }
}
```

---

#### GET /api/agent/usage

Get token usage and cost for a project.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/usage?projectId=default', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tokensInput": 5000,
    "tokensOutput": 15000,
    "costUsd": 0.25,
    "messageCount": 50
  }
}
```

---

#### POST /api/agent/compact

Compact conversation to save context.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/compact', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectId: 'default'
  })
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": "Conversation with 15 messages about: code review",
    "tokensSaved": 1500,
    "message": "Compact feature will use Claude to summarize"
  }
}
```

---

### Conversation Endpoints

#### GET /api/agent/conversations

List all conversations for the authenticated user.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/conversations?limit=10&offset=0', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `archived` | boolean | NO | Include archived conversations |
| `limit` | number | NO | Max results to return |
| `offset` | number | NO | Pagination offset |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "conversationId": "conv_abc123",
      "title": "React hooks discussion",
      "sessionId": "session_xyz789",
      "modelUsed": "claude-3-opus",
      "messageCount": 15,
      "lastMessageAt": "2024-12-26T10:00:00.000Z",
      "createdAt": "2024-12-26T09:00:00.000Z"
    }
  ]
}
```

---

#### GET /api/agent/resumable

List all resumable conversations (those with sessionId).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/resumable', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "conversationId": "conv_abc123",
      "title": "Code review session",
      "sessionId": "session_xyz789",
      "workspacePath": "/workspaces/user123/default",
      "modelUsed": "claude-3-opus",
      "messageCount": 10,
      "lastMessageAt": "2024-12-26T10:00:00.000Z",
      "createdAt": "2024-12-26T09:00:00.000Z"
    }
  ]
}
```

---

#### GET /api/agent/conversations/:conversationId

Get conversation details including session info.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/conversations/conv_abc123', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_abc123",
    "title": "Code review",
    "workspacePath": "/workspaces/user123/default",
    "sessionId": "session_xyz789",
    "modelUsed": "claude-3-opus",
    "isArchived": false,
    "isPinned": false,
    "totalTokensUsed": 5000,
    "totalCostUsd": 0.15,
    "messageCount": 10,
    "tags": ["code", "review"],
    "canResume": true,
    "lastMessageAt": "2024-12-26T10:00:00.000Z",
    "createdAt": "2024-12-26T09:00:00.000Z",
    "updatedAt": "2024-12-26T10:00:00.000Z"
  }
}
```

---

#### GET /api/agent/conversations/:conversationId/messages

Get all messages for a conversation.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/conversations/conv_abc123/messages', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "messageId": "msg_001",
      "role": "user",
      "content": "What is React?",
      "createdAt": "2024-12-26T09:00:00.000Z"
    },
    {
      "messageId": "msg_002",
      "role": "assistant",
      "content": "React is a JavaScript library for building user interfaces...",
      "createdAt": "2024-12-26T09:00:05.000Z"
    }
  ]
}
```

---

#### POST /api/agent/resume/:conversationId

Resume a conversation by ID (streaming).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/resume/conv_abc123', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Continue where we left off'
  })
})
```

---

#### POST /api/agent/resume/:conversationId/sync

Resume a conversation by ID (synchronous).

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/agent/resume/conv_abc123/sync', {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Continue where we left off'
  })
})
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Sure! Let me continue from where we stopped...",
    "conversationId": "conv_abc123",
    "sessionId": "session_xyz789"
  }
}
```

---

### Skills Endpoints

#### GET /api/skills

List all available skills.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills?projectPath=/path/to/project')
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | NO | Path to project directory |

**Response:**
```json
{
  "success": true,
  "skills": [
    {
      "name": "code-review",
      "description": "Review code for best practices",
      "type": "project",
      "allowedTools": ["Read", "Grep"],
      "hasContent": true
    }
  ],
  "count": 1
}
```

---

#### GET /api/skills/:name

Get skill details by name.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills/code-review')
```

**Response:**
```json
{
  "success": true,
  "skill": {
    "name": "code-review",
    "description": "Review code for best practices",
    "allowedTools": ["Read", "Grep"],
    "content": "You are a code reviewer. Analyze the code...",
    "path": "/project/.claude/skills/code-review/SKILL.md",
    "type": "project"
  }
}
```

---

#### POST /api/skills

Create a new skill.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'my-skill',
    description: 'A custom skill',
    content: 'You are a helpful assistant that...',
    allowedTools: ['Read', 'Write'],
    projectPath: '/path/to/project'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | YES | Skill name (lowercase, numbers, hyphens) |
| `description` | string | YES | Skill description |
| `content` | string | NO | Skill content/instructions |
| `allowedTools` | string[] | NO | Tools the skill can use |
| `projectPath` | string | NO | Project directory path |

**Response:**
```json
{
  "success": true,
  "message": "Skill \"my-skill\" created at /project/.claude/skills/my-skill",
  "path": "/project/.claude/skills/my-skill"
}
```

---

#### DELETE /api/skills/:name

Delete a skill.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills/my-skill?projectPath=/path/to/project', {
  method: 'DELETE'
})
```

**Response:**
```json
{
  "success": true,
  "message": "Skill \"my-skill\" deleted"
}
```

---

#### POST /api/skills/match

Match skills to a prompt.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills/match', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    prompt: 'Review my code',
    projectPath: '/path/to/project'
  })
})
```

**Response:**
```json
{
  "success": true,
  "matches": [
    {
      "name": "code-review",
      "description": "Review code for best practices",
      "score": 0.95,
      "allowedTools": ["Read", "Grep"]
    }
  ],
  "count": 1
}
```

---

#### POST /api/skills/upload

Upload a skill file.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills/upload', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    skillName: 'my-skill',
    fileName: 'SKILL.md',
    content: '---\nname: my-skill\ndescription: My skill\n---\nSkill content here',
    projectPath: '/path/to/project'
  })
})
```

**Response:**
```json
{
  "success": true,
  "message": "File uploaded to /project/.claude/skills/my-skill/SKILL.md",
  "path": "/project/.claude/skills/my-skill/SKILL.md",
  "skillDir": "/project/.claude/skills/my-skill"
}
```

---

#### POST /api/skills/init

Initialize skills folder in a project.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/skills/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    projectPath: '/path/to/project'
  })
})
```

**Response:**
```json
{
  "success": true,
  "message": "Skills folder initialized at /project/.claude/skills",
  "path": "/project/.claude/skills"
}
```

---

### Search Endpoints

#### GET /api/search/status

Check if search is configured.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/search/status')
```

**Response:**
```json
{
  "success": true,
  "configured": true,
  "provider": "tavily"
}
```

---

#### POST /api/search

Perform a web search.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'React hooks tutorial',
    maxResults: 5,
    searchDepth: 'basic'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | YES | Search query |
| `maxResults` | number | NO | Max results (default: 5) |
| `searchDepth` | string | NO | "basic" or "advanced" |

**Response:**
```json
{
  "success": true,
  "query": "React hooks tutorial",
  "answer": "React Hooks are functions that let you use state...",
  "results": [
    {
      "title": "React Hooks Guide",
      "url": "https://example.com/react-hooks",
      "content": "A comprehensive guide to React hooks..."
    }
  ],
  "count": 5
}
```

---

#### POST /api/search/research

Research a topic for best practices.

**Authentication:** NOT required

**Request:**
```javascript
fetch('https://api.openanalyst.com/api/search/research', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'React state management',
    context: 'Building a large e-commerce application'
  })
})
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | string | YES | Topic to research |
| `context` | string | NO | Additional context |

**Response:**
```json
{
  "success": true,
  "topic": "React state management",
  "findings": [
    "Redux is widely used for complex state",
    "Context API is sufficient for simple cases"
  ],
  "recommendations": [
    "Use Redux Toolkit for less boilerplate",
    "Consider Zustand for simpler API"
  ],
  "sources": [
    "https://redux.js.org/",
    "https://react.dev/learn/scaling-up-with-reducer-and-context"
  ]
}
```

---

### Pending Responses Endpoints

#### GET /api/pending-responses

Get all pending/completed responses.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/pending-responses?status=pending,completed&limit=50', {
  headers: { 'X-API-Key': API_KEY }
})
```

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | NO | Filter by status (comma-separated) |
| `limit` | number | NO | Max results (default: 50) |
| `offset` | number | NO | Pagination offset |

---

#### GET /api/pending-responses/deliver

Get completed responses and mark as delivered.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/pending-responses/deliver?limit=50', {
  headers: { 'X-API-Key': API_KEY }
})
```

---

#### GET /api/pending-responses/counts

Get status counts for the user.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/pending-responses/counts', {
  headers: { 'X-API-Key': API_KEY }
})
```

---

#### GET /api/pending-responses/subscribe

Subscribe to SSE stream for real-time updates.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

const eventSource = new EventSource(
  'https://api.openanalyst.com/api/pending-responses/subscribe',
  {
    headers: { 'X-API-Key': API_KEY }
  }
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Update:', data);
};
```

---

#### GET /api/pending-responses/:correlationId

Get status of a specific request.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/pending-responses/corr_abc123', {
  headers: { 'X-API-Key': API_KEY }
})
```

---

#### GET /api/pending-responses/:correlationId/deliver

Get response and mark as delivered.

**Authentication:** REQUIRED

---

#### GET /api/pending-responses/:correlationId/subscribe

Subscribe to SSE stream for a specific correlation ID.

**Authentication:** REQUIRED

---

#### POST /api/pending-responses/:correlationId/retry

Retry a failed request.

**Authentication:** REQUIRED

**Request:**
```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

fetch('https://api.openanalyst.com/api/pending-responses/corr_abc123/retry', {
  method: 'POST',
  headers: { 'X-API-Key': API_KEY }
})
```

---

## Streaming (SSE)

Some endpoints return Server-Sent Events (SSE) for real-time streaming. Here's how to handle them:

### JavaScript/TypeScript Example

```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

async function streamQuery(prompt) {
  const response = await fetch('https://api.openanalyst.com/api/agent/run', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullResponse = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    fullResponse += chunk;

    // Process each chunk as it arrives
    console.log('Chunk:', chunk);
  }

  return fullResponse;
}

// Usage
streamQuery('Explain React hooks').then(console.log);
```

---

## WebSocket Connection

The API supports WebSocket connections for real-time communication.

### Connection URL

```
wss://api.openanalyst.com/ws
```

### JavaScript Example

```javascript
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

const ws = new WebSocket('wss://api.openanalyst.com/ws');

ws.onopen = () => {
  console.log('Connected to WebSocket');

  // Authenticate
  ws.send(JSON.stringify({
    type: 'auth',
    apiKey: API_KEY
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from WebSocket');
};
```

---

## Complete Code Examples

### TypeScript/JavaScript API Client

```typescript
// openanalyst-client.ts

const API_BASE = 'https://api.openanalyst.com';
const API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

class OpenAnalystClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string = API_KEY, baseUrl: string = API_BASE) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    return response.json();
  }

  // Health check
  async health(): Promise<ApiResponse<any>> {
    return this.request('/health');
  }

  // Run agent (synchronous)
  async runAgent(prompt: string, options: {
    projectId?: string;
    model?: string;
    systemPrompt?: string;
  } = {}): Promise<ApiResponse<{ result: string; conversationId: string }>> {
    return this.request('/api/agent/run-sync', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...options }),
    });
  }

  // Run agent (streaming)
  async runAgentStream(prompt: string, onChunk: (chunk: string) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/agent/run`, {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value));
    }
  }

  // Continue conversation
  async continueConversation(
    prompt: string,
    conversationId: string
  ): Promise<ApiResponse<{ result: string }>> {
    return this.request('/api/agent/sdk/continue-sync', {
      method: 'POST',
      body: JSON.stringify({ prompt, conversationId }),
    });
  }

  // List conversations
  async listConversations(): Promise<ApiResponse<any[]>> {
    return this.request('/api/agent/conversations');
  }

  // Get conversation messages
  async getMessages(conversationId: string): Promise<ApiResponse<any[]>> {
    return this.request(`/api/agent/conversations/${conversationId}/messages`);
  }

  // Search web
  async search(query: string, maxResults: number = 5): Promise<ApiResponse<any>> {
    return this.request('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query, maxResults }),
    });
  }
}

// Usage Example
async function main() {
  const client = new OpenAnalystClient();

  // Check health
  const health = await client.health();
  console.log('Health:', health);

  // Run a query
  const response = await client.runAgent('What is TypeScript?');
  console.log('Response:', response.data?.result);

  // Stream a query
  console.log('\nStreaming response:');
  await client.runAgentStream('Explain async/await', (chunk) => {
    process.stdout.write(chunk);
  });
}

main().catch(console.error);
```

### Python API Client

```python
# openanalyst_client.py

import requests
from typing import Optional, Dict, Any, Generator

API_BASE = 'https://api.openanalyst.com'
API_KEY = '714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1'

class OpenAnalystClient:
    def __init__(self, api_key: str = API_KEY, base_url: str = API_BASE):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json'
        }

    def health(self) -> Dict[str, Any]:
        """Check API health."""
        response = requests.get(f'{self.base_url}/health')
        return response.json()

    def run_agent(
        self,
        prompt: str,
        project_id: Optional[str] = None,
        model: Optional[str] = None
    ) -> Dict[str, Any]:
        """Run agent and get JSON response."""
        payload = {'prompt': prompt}
        if project_id:
            payload['projectId'] = project_id
        if model:
            payload['model'] = model

        response = requests.post(
            f'{self.base_url}/api/agent/run-sync',
            headers=self.headers,
            json=payload
        )
        return response.json()

    def run_agent_stream(self, prompt: str) -> Generator[str, None, None]:
        """Run agent with streaming response."""
        response = requests.post(
            f'{self.base_url}/api/agent/run',
            headers=self.headers,
            json={'prompt': prompt},
            stream=True
        )

        for chunk in response.iter_content(chunk_size=None, decode_unicode=True):
            if chunk:
                yield chunk

    def list_conversations(self) -> Dict[str, Any]:
        """List all conversations."""
        response = requests.get(
            f'{self.base_url}/api/agent/conversations',
            headers=self.headers
        )
        return response.json()

    def get_messages(self, conversation_id: str) -> Dict[str, Any]:
        """Get messages for a conversation."""
        response = requests.get(
            f'{self.base_url}/api/agent/conversations/{conversation_id}/messages',
            headers=self.headers
        )
        return response.json()

    def search(self, query: str, max_results: int = 5) -> Dict[str, Any]:
        """Search the web."""
        response = requests.post(
            f'{self.base_url}/api/search',
            headers=self.headers,
            json={'query': query, 'maxResults': max_results}
        )
        return response.json()


# Usage Example
if __name__ == '__main__':
    client = OpenAnalystClient()

    # Check health
    health = client.health()
    print(f"Health: {health['status']}")

    # Run a query
    response = client.run_agent('What is Python?')
    if response['success']:
        print(f"Response: {response['data']['result']}")

    # Stream a query
    print("\nStreaming response:")
    for chunk in client.run_agent_stream('Explain decorators in Python'):
        print(chunk, end='', flush=True)
```

---

## Rate Limits

| Endpoint Pattern | Requests | Window |
|------------------|----------|--------|
| `/api/auth/*` | 5 | 15 minutes |
| `/api/*` | 100 | 1 minute |

If you exceed the rate limit, you'll receive:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later"
  }
}
```

---

## Support

If you encounter issues:

1. Check the `/health` endpoint to verify the API is running
2. Ensure your API key is correct
3. Check for rate limiting
4. Review the error response for specific error codes

---

**API Version:** 2.0.0
**Documentation Version:** 1.0.0
**Last Updated:** December 26, 2024
