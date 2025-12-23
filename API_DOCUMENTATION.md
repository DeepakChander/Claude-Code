# OpenAnalyst API Documentation

> **Version**: 2.0  
> **Base URL**: `http://16.171.8.128:3456`  
> **WebSocket**: `ws://16.171.8.128:3456/ws`

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [HTTP Endpoints](#2-http-endpoints)
3. [WebSocket API](#3-websocket-api)
4. [Data Types](#4-data-types)
5. [Error Handling](#5-error-handling)
6. [Examples](#6-examples)

---

## 1. Authentication

### Get JWT Token

```http
POST /api/auth/token
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "user-123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2025-12-30T12:00:00.000Z",
    "userId": "user-123"
  }
}
```

### Using the Token

Include the token in all API requests:
```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 2. HTTP Endpoints

### 2.1 Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-12-23T12:00:00.000Z"
}
```

---

### 2.2 Chat (SSE Streaming)

```http
POST /api/agent/sdk/chat
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Create a hello.txt file with Hello World",
  "projectId": "default",
  "sessionId": "session-123",
  "model": "anthropic/claude-sonnet-4",
  "stream": true
}
```

**Response:** Server-Sent Events stream

```
data: {"type":"system","subtype":"init","session_id":"session-123","mode":"streaming"}
data: {"type":"text","content":"I'll create..."}
data: {"type":"tool_use","tool":"Write","input":{...}}
data: {"type":"complete"}
```

---

### 2.3 Submit Tool Results

```http
POST /api/agent/sdk/tools
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "sessionId": "session-123",
  "toolResults": [
    {
      "tool_use_id": "tool-abc-123",
      "output": "File created successfully",
      "is_error": false
    }
  ]
}
```

---

### 2.4 List Sessions

```http
GET /api/agent/sessions
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessions": [
      {
        "id": "session-123",
        "title": "Create Node.js API",
        "createdAt": "2025-12-23T12:00:00.000Z",
        "messageCount": 5
      }
    ]
  }
}
```

---

## 3. WebSocket API

### 3.1 Connection

```javascript
const ws = new WebSocket('ws://16.171.8.128:3456/ws');
```

### 3.2 Client → Server Messages

| Message Type | Description | Payload |
|--------------|-------------|---------|
| `authenticate` | Auth with JWT | `{ token: "JWT" }` |
| `chat` | Send chat message | `{ prompt, sessionId, projectId }` |
| `approve` | Approve tool execution | `{ toolCallId }` |
| `reject` | Reject tool execution | `{ toolCallId, reason? }` |
| `subscribe` | Subscribe to session | `{ sessionId }` |
| `ping` | Keep connection alive | `{}` |

#### Chat Message Example
```json
{
  "type": "chat",
  "payload": {
    "prompt": "Create a Node.js API with Express",
    "sessionId": "session-12345",
    "projectId": "default"
  }
}
```

#### Approve Message Example
```json
{
  "type": "approve",
  "payload": {
    "toolCallId": "tool-abc-123"
  }
}
```

---

### 3.3 Server → Client Messages

| Message Type | Description | Data |
|--------------|-------------|------|
| `connected` | Connection established | `{ clientId, message }` |
| `authenticated` | Auth successful | `{ success: true }` |
| `thinking` | AI is reasoning | `{ content }` |
| `text` | Streaming text | `{ content, delta }` |
| `todo_created` | Todo list created | `{ todos: [...] }` |
| `task_started` | Task began | `{ todoId, content }` |
| `task_completed` | Task finished | `{ todoId }` |
| `tool_use` | Auto-executed tool | `{ toolName, toolInput }` |
| `approval_needed` | Needs user approval | `{ toolCallId, toolName, preview }` |
| `tool_result` | Tool execution result | `{ success, output, error }` |
| `complete` | Stream finished | `{ tokensInput, tokensOutput }` |
| `error` | Error occurred | `{ message }` |

#### Approval Needed Example
```json
{
  "type": "approval_needed",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:00.000Z",
  "data": {
    "toolCallId": "tool-abc-123",
    "toolName": "Write",
    "toolInput": {
      "file_path": "package.json",
      "content": "{ \"name\": \"my-app\" }"
    },
    "requiresApproval": true,
    "preview": {
      "filePath": "package.json",
      "content": "{ \"name\": \"my-app\" }"
    }
  }
}
```

#### Todo Created Example
```json
{
  "type": "todo_created",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:00.000Z",
  "data": {
    "todos": [
      { "id": "todo-0", "content": "Create package.json", "status": "pending" },
      { "id": "todo-1", "content": "Create server.js", "status": "pending" }
    ]
  }
}
```

---

## 4. Data Types

### TodoItem
```typescript
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
```

### ToolPreview (for Write)
```typescript
interface WritePreview {
  filePath: string;
  content: string;
}
```

### ToolPreview (for Bash)
```typescript
interface BashPreview {
  command: string;
}
```

---

## 5. Error Handling

### HTTP Errors
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found"
  }
}
```

### WebSocket Errors
```json
{
  "type": "error",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:00.000Z",
  "data": {
    "message": "Missing prompt or sessionId"
  }
}
```

### Common Error Codes
| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Missing or invalid JWT token |
| `NOT_FOUND` | Endpoint or resource not found |
| `RATE_LIMITED` | Too many requests |
| `VALIDATION_ERROR` | Invalid request body |
| `INTERNAL_ERROR` | Server error |

---

## 6. Examples

### 6.1 Full WebSocket Chat Flow

```javascript
const ws = new WebSocket('ws://16.171.8.128:3456/ws');

ws.onopen = () => {
  // 1. Authenticate
  ws.send(JSON.stringify({
    type: 'authenticate',
    payload: { token: 'YOUR_JWT_TOKEN' }
  }));
  
  // 2. Send chat message
  ws.send(JSON.stringify({
    type: 'chat',
    payload: {
      prompt: 'Create a Node.js API with Express',
      sessionId: 'session-' + Date.now(),
      projectId: 'default'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'thinking':
      console.log('💭 Thinking:', message.data.content);
      break;
      
    case 'text':
      console.log('📝 Text:', message.data.delta);
      break;
      
    case 'todo_created':
      console.log('📋 Todo list:', message.data.todos);
      break;
      
    case 'approval_needed':
      console.log('⚠️ Approval needed:', message.data.toolName);
      // Auto-approve for demo
      ws.send(JSON.stringify({
        type: 'approve',
        payload: { toolCallId: message.data.toolCallId }
      }));
      break;
      
    case 'tool_result':
      console.log('✅ Result:', message.data.output);
      break;
      
    case 'complete':
      console.log('🎉 Complete!');
      break;
      
    case 'error':
      console.error('❌ Error:', message.data.message);
      break;
  }
};
```

### 6.2 cURL Examples

**Get Token:**
```bash
curl -X POST http://16.171.8.128:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user"}'
```

**Health Check:**
```bash
curl http://16.171.8.128:3456/health
```

**Chat (SSE):**
```bash
curl -X POST http://16.171.8.128:3456/api/agent/sdk/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"prompt":"Hello","projectId":"default"}'
```

---

## Quick Reference

| Purpose | URL |
|---------|-----|
| **Health Check** | `GET http://16.171.8.128:3456/health` |
| **Get Token** | `POST http://16.171.8.128:3456/api/auth/token` |
| **Chat (SSE)** | `POST http://16.171.8.128:3456/api/agent/sdk/chat` |
| **WebSocket** | `ws://16.171.8.128:3456/ws` |
| **Submit Tools** | `POST http://16.171.8.128:3456/api/agent/sdk/tools` |

---

**Last Updated**: 2025-12-23  
**Server Status**: ✅ Running on EC2
