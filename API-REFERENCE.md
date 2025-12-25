# OpenAnalyst API Reference

Complete API documentation for all OpenAnalyst services deployed on AWS EC2.

---

## Table of Contents

1. [Server Information](#server-information)
2. [Brain API (Port 3456)](#brain-api)
3. [WebSocket Hub (Port 8002)](#websocket-hub)
4. [Agno Orchestrator (Port 8001)](#agno-orchestrator)
5. [Windmill (Port 8000)](#windmill)
6. [Authentication](#authentication)
7. [Testing with cURL](#testing-with-curl)

---

## Server Information

| Server | IP Address | Services |
|--------|------------|----------|
| Brain + WebSocket Hub | 13.49.125.60 | Brain (3456), WebSocket (8002) |
| Orchestration | 13.60.42.124 | Agno (8001), Windmill (8000), Redis (6379) |
| Frontend | 13.48.55.155 | Next.js (3000) |

---

## Brain API

Base URL: `http://13.49.125.60:3456`

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-24T19:37:01.377Z",
  "version": "2.0.0",
  "service": "openanalyst-api",
  "environment": "production",
  "database": {
    "type": "mongodb",
    "connected": true
  },
  "websocket": {
    "enabled": true,
    "path": "/ws",
    "connectedClients": 0
  }
}
```

### Authentication Endpoints

#### Register User

```bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt_token_here"
}
```

#### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### Verify Token

```bash
GET /api/auth/verify
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "valid": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com"
  }
}
```

### Agent Endpoints

#### Chat with Agent

```bash
POST /api/agent/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "What is the current market analysis for AAPL?",
  "conversationId": "optional_conversation_id",
  "context": {
    "workspaceId": "optional_workspace_id"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "response": {
    "message": "Based on the current market data...",
    "conversationId": "conv_12345",
    "taskId": "task_67890"
  }
}
```

#### Get Conversation History

```bash
GET /api/agent/conversations
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv_12345",
      "title": "Market Analysis",
      "createdAt": "2025-12-24T10:00:00Z",
      "messageCount": 5
    }
  ]
}
```

#### Get Conversation Messages

```bash
GET /api/agent/conversations/:conversationId
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "success": true,
  "conversation": {
    "id": "conv_12345",
    "messages": [
      {
        "role": "user",
        "content": "What is the market analysis?",
        "timestamp": "2025-12-24T10:00:00Z"
      },
      {
        "role": "assistant",
        "content": "Based on current data...",
        "timestamp": "2025-12-24T10:00:05Z"
      }
    ]
  }
}
```

### Skills Endpoints

#### List Available Skills

```bash
GET /api/skills
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "success": true,
  "skills": [
    {
      "id": "market_analysis",
      "name": "Market Analysis",
      "description": "Analyze market data and trends",
      "category": "finance"
    },
    {
      "id": "web_search",
      "name": "Web Search",
      "description": "Search the web for information",
      "category": "research"
    }
  ]
}
```

#### Execute Skill

```bash
POST /api/skills/:skillId/execute
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "parameters": {
    "query": "AAPL stock performance"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "result": {
    "data": "Skill execution result...",
    "executionTime": 1234
  }
}
```

### Pending Responses

#### Get Pending Responses

```bash
GET /api/pending-responses
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "success": true,
  "pendingResponses": [
    {
      "id": "resp_12345",
      "question": "Please clarify your request",
      "options": ["Option A", "Option B"],
      "createdAt": "2025-12-24T10:00:00Z"
    }
  ]
}
```

#### Submit Response

```bash
POST /api/pending-responses/:responseId
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "answer": "Option A"
}
```

---

## WebSocket Hub

Base URL: `ws://13.49.125.60:8002/ws`

### Health Check

```bash
GET http://13.49.125.60:8002/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "websocket-hub",
  "timestamp": "2025-12-24T19:37:08.512Z",
  "connections": {
    "totalConnections": 0,
    "uniqueUsers": 0
  }
}
```

### WebSocket Connection

Connect with JWT token as query parameter:

```javascript
const ws = new WebSocket('ws://13.49.125.60:8002/ws?token=<jwt_token>');

ws.onopen = () => {
  console.log('Connected to WebSocket Hub');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Send message
ws.send(JSON.stringify({
  type: 'chat',
  content: 'Hello'
}));
```

### Message Types

#### Incoming Messages

| Type | Description |
|------|-------------|
| `message` | Chat response from agent |
| `task_progress` | Task execution progress updates |
| `task_complete` | Task completed notification |
| `error` | Error notification |
| `pending_response` | Agent needs clarification |

#### Outgoing Messages

| Type | Description |
|------|-------------|
| `chat` | Send chat message to agent |
| `subscribe` | Subscribe to conversation updates |
| `unsubscribe` | Unsubscribe from conversation |

---

## Agno Orchestrator

Base URL: `http://13.60.42.124:8001`

### Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "agno-orchestrator",
  "version": "1.0.0",
  "components": {
    "windmill": "connected",
    "agents": {
      "coordinator": "active",
      "planner": "active",
      "executor": "active"
    }
  }
}
```

### Execute Task

```bash
POST /execute
Content-Type: application/json
Authorization: Bearer <api_key>

{
  "task": "analyze_market",
  "parameters": {
    "symbol": "AAPL"
  },
  "userId": "user_12345"
}
```

**Response (200):**
```json
{
  "success": true,
  "taskId": "task_67890",
  "status": "queued"
}
```

### Get Task Status

```bash
GET /tasks/:taskId
Authorization: Bearer <api_key>
```

**Response (200):**
```json
{
  "taskId": "task_67890",
  "status": "completed",
  "result": {
    "data": "Analysis results..."
  },
  "executionTime": 5432
}
```

---

## Windmill

Base URL: `http://13.60.42.124:8000`

### Version

```bash
GET /api/version
```

**Response:**
```
CE v1.598.0
```

### Login

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@windmill.dev",
  "password": "changeme"
}
```

**Response:**
```
<api_token>
```

### List Workspaces

```bash
GET /api/workspaces/list
Authorization: Bearer <api_token>
```

### Web UI

Access the Windmill dashboard at: `http://13.60.42.124:8000`

- **Email:** admin@windmill.dev
- **Password:** changeme
- **Workspace:** openanalyst

---

## Authentication

### JWT Token Authentication

Most endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Obtain a token by logging in via `/api/auth/login`.

### Master API Key

For server-to-server communication with the Brain API:

```
X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1
```

### Windmill API Token

For Windmill API access:

```
Authorization: Bearer Bv7Slg229K5bxjtqnNmjdf8S67oR8HcI
```

---

## Testing with cURL

### Test All Health Endpoints

```bash
# Brain Health
curl http://13.49.125.60:3456/health

# WebSocket Hub Health
curl http://13.49.125.60:8002/health

# Agno Health
curl http://13.60.42.124:8001/health

# Windmill Version
curl http://13.60.42.124:8000/api/version
```

### Register and Login

```bash
# Register
curl -X POST http://13.49.125.60:3456/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# Login
curl -X POST http://13.49.125.60:3456/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### Chat with Agent

```bash
# Replace <token> with JWT token from login
curl -X POST http://13.49.125.60:3456/api/agent/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"message":"Hello, analyze the market for AAPL"}'
```

### List Skills

```bash
curl http://13.49.125.60:3456/api/skills \
  -H "Authorization: Bearer <token>"
```

---

## Error Responses

### Common Error Codes

| Status | Description |
|--------|-------------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "The provided token is invalid or expired"
  }
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/auth/*` | 10 requests/minute |
| `/api/agent/chat` | 30 requests/minute |
| `/api/skills/*` | 60 requests/minute |
| Other endpoints | 100 requests/minute |

---

## WebSocket Connection Limits

- Maximum connections per user: 5
- Message rate limit: 20 messages/second
- Connection timeout: 30 seconds of inactivity

---

*Last Updated: December 24, 2025*
