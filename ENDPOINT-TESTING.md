# OpenAnalyst API - Verified Working Endpoints

**Base URL:** `https://api.openanalyst.com`
**API Key:** `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
**Last Tested:** December 26, 2025

---

## Quick Reference

| Category | Endpoints Count | Auth Required |
|----------|-----------------|---------------|
| Health & Info | 2 | NO |
| Authentication | 2 | NO |
| Agent | 10 | YES |
| Skills | 6 | NO |
| Search | 3 | NO |
| Pending Responses | 6 | YES |
| WebSocket | 1 | YES (JWT) |

---

## 1. HEALTH & INFO ENDPOINTS (No Auth Required)

### 1.1 Server Health Check

```bash
curl -X GET "https://api.openanalyst.com/health"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/health`
- Headers: None required

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-26T11:12:27.102Z",
  "version": "2.0.0",
  "service": "openanalyst-api",
  "environment": "production",
  "database": {
    "type": "mongodb",
    "connected": true
  }
}
```

---

### 1.2 API Info

```bash
curl -X GET "https://api.openanalyst.com/"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/`
- Headers: None required

**Response:**
```json
{
  "message": "OpenAnalyst API - Claude Code on AWS",
  "version": "2.0.0",
  "documentation": "/api",
  "endpoints": { ... }
}
```

---

## 2. AUTHENTICATION ENDPOINTS (No Auth Required)

### 2.1 Generate JWT Token

```bash
curl -X POST "https://api.openanalyst.com/api/auth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "email": "user@example.com",
    "apiKey": "714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/auth/token`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "userId": "user123",
  "email": "user@example.com",
  "apiKey": "714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2026-01-02T11:13:23.740Z",
    "userId": "user123"
  }
}
```

---

### 2.2 Verify JWT Token

```bash
curl -X POST "https://api.openanalyst.com/api/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "token": "YOUR_JWT_TOKEN_HERE"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/auth/verify`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Valid):**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "userId": "user123",
    "email": "user@example.com",
    "expiresAt": "2026-01-02T11:13:23.000Z"
  }
}
```

**Response (Invalid):**
```json
{
  "success": true,
  "data": {
    "valid": false,
    "error": "jwt malformed"
  }
}
```

---

## 3. AGENT ENDPOINTS (Auth Required)

**For all Agent endpoints, add this header:**
```
X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1
```

### 3.1 Agent Health Check

```bash
curl -X GET "https://api.openanalyst.com/api/agent/health" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/agent/health`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": {
    "openrouter": "unknown",
    "configured": false,
    "mode": "sdk"
  }
}
```

---

### 3.2 Run Agent (Synchronous)

```bash
curl -X POST "https://api.openanalyst.com/api/agent/run-sync" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "What is TypeScript?"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/agent/run-sync`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "prompt": "What is TypeScript?"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "TypeScript is a strongly typed programming language...",
    "conversationId": "conv_abc123",
    "sessionId": "session_xyz789"
  }
}
```

---

### 3.3 Run Agent SDK (Synchronous)

```bash
curl -X POST "https://api.openanalyst.com/api/agent/sdk/run-sync" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explain React hooks"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/agent/sdk/run-sync`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "prompt": "Explain React hooks"
}
```

---

### 3.4 List Conversations

```bash
curl -X GET "https://api.openanalyst.com/api/agent/conversations" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/agent/conversations`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": []
}
```

---

### 3.5 List Resumable Conversations

```bash
curl -X GET "https://api.openanalyst.com/api/agent/resumable" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/agent/resumable`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

---

### 3.6 Get Agent Skills

```bash
curl -X GET "https://api.openanalyst.com/api/agent/skills" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/agent/skills`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": {
    "skills": [],
    "agnoAvailable": true
  }
}
```

---

### 3.7 Get Usage Statistics

```bash
curl -X GET "https://api.openanalyst.com/api/agent/usage" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/agent/usage`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": {
    "tokensInput": 0,
    "tokensOutput": 0,
    "costUsd": 0,
    "messageCount": 0
  }
}
```

---

### 3.8 Orchestrate Request

```bash
curl -X POST "https://api.openanalyst.com/api/agent/orchestrate" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Search for latest React news"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/agent/orchestrate`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "prompt": "Search for latest React news"
}
```

---

### 3.9 Continue Conversation

```bash
curl -X POST "https://api.openanalyst.com/api/agent/sdk/continue-sync" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Tell me more about that",
    "conversationId": "YOUR_CONVERSATION_ID"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/agent/sdk/continue-sync`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "prompt": "Tell me more about that",
  "conversationId": "conv_abc123"
}
```

---

### 3.10 Compact Conversation

```bash
curl -X POST "https://api.openanalyst.com/api/agent/compact" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "default"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/agent/compact`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "projectId": "default"
}
```

---

## 4. SKILLS ENDPOINTS (No Auth Required)

### 4.1 List All Skills

```bash
curl -X GET "https://api.openanalyst.com/api/skills"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/skills`
- Headers: None required

**Response:**
```json
{
  "success": true,
  "skills": [
    {
      "name": "Analytics",
      "description": "Data analysis, metrics tracking, report generation, and dashboards",
      "type": "project",
      "allowedTools": [],
      "hasContent": true
    },
    {
      "name": "Core",
      "description": "General purpose assistant for help, questions, and explanations",
      "type": "project",
      "allowedTools": [],
      "hasContent": true
    }
  ],
  "count": 4
}
```

---

### 4.2 Get Skill by Name

```bash
curl -X GET "https://api.openanalyst.com/api/skills/Core"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/skills/Core`
- Headers: None required

---

### 4.3 Match Skills to Prompt

```bash
curl -X POST "https://api.openanalyst.com/api/skills/match" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "analyze my sales data"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/skills/match`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "prompt": "analyze my sales data"
}
```

**Response:**
```json
{
  "success": true,
  "matches": [],
  "count": 0
}
```

---

### 4.4 Create New Skill

```bash
curl -X POST "https://api.openanalyst.com/api/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-custom-skill",
    "description": "A custom skill for testing",
    "content": "You are a helpful assistant",
    "allowedTools": ["Read", "Write"]
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/skills`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "name": "my-custom-skill",
  "description": "A custom skill for testing",
  "content": "You are a helpful assistant",
  "allowedTools": ["Read", "Write"]
}
```

---

### 4.5 Initialize Skills Folder

```bash
curl -X POST "https://api.openanalyst.com/api/skills/init" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/skills/init`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{}
```

**Response:**
```json
{
  "success": true,
  "message": "Skills folder initialized at /home/ubuntu/openanalyst/services/brain/.claude/skills",
  "path": "/home/ubuntu/openanalyst/services/brain/.claude/skills"
}
```

---

### 4.6 Delete Skill

```bash
curl -X DELETE "https://api.openanalyst.com/api/skills/my-custom-skill"
```

**Postman:**
- Method: `DELETE`
- URL: `https://api.openanalyst.com/api/skills/my-custom-skill`
- Headers: None required

---

## 5. SEARCH ENDPOINTS (No Auth Required)

### 5.1 Check Search Status

```bash
curl -X GET "https://api.openanalyst.com/api/search/status"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/search/status`
- Headers: None required

**Response:**
```json
{
  "success": true,
  "configured": true,
  "provider": "tavily"
}
```

---

### 5.2 Web Search

```bash
curl -X POST "https://api.openanalyst.com/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "React hooks tutorial",
    "maxResults": 5
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/search`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "query": "React hooks tutorial",
  "maxResults": 5
}
```

**Response:**
```json
{
  "success": true,
  "query": "React hooks tutorial",
  "answer": "React hooks are functions that let functional components manage state...",
  "results": [
    {
      "title": "React Hooks - W3Schools",
      "url": "https://www.w3schools.com/react/react_hooks.asp",
      "content": "...",
      "score": 0.91
    }
  ],
  "count": 5
}
```

---

### 5.3 Research Topic

```bash
curl -X POST "https://api.openanalyst.com/api/search/research" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "React best practices 2025"
  }'
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/search/research`
- Headers:
  - `Content-Type: application/json`
- Body (raw JSON):
```json
{
  "topic": "React best practices 2025"
}
```

**Response:**
```json
{
  "success": true,
  "topic": "React best practices 2025",
  "findings": [
    "Keep in mind that being proficient in these methods is the first step...",
    "The modern React ecosystem has evolved significantly..."
  ],
  "recommendations": [
    "Use GraphQL for precise data fetching...",
    "Implement code splitting for better performance..."
  ],
  "sources": [
    {
      "title": "React JS Best Practices 2025",
      "url": "https://www.lucentinnovation.com/..."
    }
  ]
}
```

---

## 6. PENDING RESPONSES ENDPOINTS (Auth Required)

### 6.1 List Pending Responses

```bash
curl -X GET "https://api.openanalyst.com/api/pending-responses" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/pending-responses`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": {
    "responses": [],
    "count": 0
  }
}
```

---

### 6.2 Get Status Counts

```bash
curl -X GET "https://api.openanalyst.com/api/pending-responses/counts" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/pending-responses/counts`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

**Response:**
```json
{
  "success": true,
  "data": {
    "counts": {
      "pending": 0,
      "processing": 0,
      "completed": 0,
      "delivered": 0,
      "expired": 0,
      "failed": 0
    }
  }
}
```

---

### 6.3 Deliver Pending Responses

```bash
curl -X GET "https://api.openanalyst.com/api/pending-responses/deliver" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/pending-responses/deliver`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

---

### 6.4 Get Specific Response

```bash
curl -X GET "https://api.openanalyst.com/api/pending-responses/CORRELATION_ID" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `GET`
- URL: `https://api.openanalyst.com/api/pending-responses/{correlationId}`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

---

### 6.5 Retry Failed Request

```bash
curl -X POST "https://api.openanalyst.com/api/pending-responses/CORRELATION_ID/retry" \
  -H "X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
```

**Postman:**
- Method: `POST`
- URL: `https://api.openanalyst.com/api/pending-responses/{correlationId}/retry`
- Headers:
  - `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1`

---

## 7. WEBSOCKET HUB

### 7.1 WebSocket Hub Health Check

```bash
curl -X GET "http://13.49.125.60:8002/health"
```

**Postman:**
- Method: `GET`
- URL: `http://13.49.125.60:8002/health`
- Headers: None required

**Response:**
```json
{
  "status": "healthy",
  "service": "websocket-hub",
  "timestamp": "2025-12-26T11:16:58.257Z",
  "connections": {
    "totalConnections": 0,
    "uniqueUsers": 0
  }
}
```

---

### 7.2 WebSocket Connection

**Step 1: Get JWT Token first**
```bash
curl -X POST "https://api.openanalyst.com/api/auth/token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "email": "user@example.com",
    "apiKey": "714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1"
  }'
```

**Step 2: Connect to WebSocket**
```
wss://api.openanalyst.com/ws?token=YOUR_JWT_TOKEN
```

**WebSocket Messages to Send:**
```json
{
  "type": "USER_REQUEST",
  "payload": {
    "content": "Hello, how are you?"
  }
}
```

```json
{
  "type": "PING",
  "payload": {}
}
```

---

## POSTMAN COLLECTION SETUP

### Global Variables
Create these variables in Postman:

| Variable | Value |
|----------|-------|
| `base_url` | `https://api.openanalyst.com` |
| `api_key` | `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |
| `jwt_token` | (set after calling /api/auth/token) |

### Headers Preset
For authenticated endpoints, use this header preset:

```
X-API-Key: {{api_key}}
Content-Type: application/json
```

---

## ERROR RESPONSES

### 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "No token provided. Use Authorization: Bearer <token> or X-API-Key: <api-key>"
  }
}
```

### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Endpoint not found"
  }
}
```

### 400 Validation Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "prompt is required"
  }
}
```

### 429 Rate Limit
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

## SUMMARY - ALL WORKING ENDPOINTS

| # | Method | Endpoint | Auth |
|---|--------|----------|------|
| 1 | GET | `/health` | NO |
| 2 | GET | `/` | NO |
| 3 | POST | `/api/auth/token` | NO |
| 4 | POST | `/api/auth/verify` | NO |
| 5 | GET | `/api/agent/health` | YES |
| 6 | POST | `/api/agent/run-sync` | YES |
| 7 | POST | `/api/agent/run` | YES |
| 8 | POST | `/api/agent/continue` | YES |
| 9 | POST | `/api/agent/sdk/run-sync` | YES |
| 10 | POST | `/api/agent/sdk/run` | YES |
| 11 | POST | `/api/agent/sdk/continue-sync` | YES |
| 12 | POST | `/api/agent/sdk/continue` | YES |
| 13 | POST | `/api/agent/sdk/chat` | YES |
| 14 | POST | `/api/agent/sdk/chat/tools` | YES |
| 15 | POST | `/api/agent/orchestrate` | YES |
| 16 | GET | `/api/agent/conversations` | YES |
| 17 | GET | `/api/agent/resumable` | YES |
| 18 | GET | `/api/agent/conversations/:id` | YES |
| 19 | GET | `/api/agent/conversations/:id/messages` | YES |
| 20 | POST | `/api/agent/resume/:id` | YES |
| 21 | POST | `/api/agent/resume/:id/sync` | YES |
| 22 | GET | `/api/agent/skills` | YES |
| 23 | GET | `/api/agent/usage` | YES |
| 24 | POST | `/api/agent/compact` | YES |
| 25 | GET | `/api/skills` | NO |
| 26 | GET | `/api/skills/:name` | NO |
| 27 | POST | `/api/skills` | NO |
| 28 | POST | `/api/skills/match` | NO |
| 29 | POST | `/api/skills/init` | NO |
| 30 | POST | `/api/skills/upload` | NO |
| 31 | DELETE | `/api/skills/:name` | NO |
| 32 | GET | `/api/search/status` | NO |
| 33 | POST | `/api/search` | NO |
| 34 | POST | `/api/search/research` | NO |
| 35 | GET | `/api/pending-responses` | YES |
| 36 | GET | `/api/pending-responses/counts` | YES |
| 37 | GET | `/api/pending-responses/deliver` | YES |
| 38 | GET | `/api/pending-responses/subscribe` | YES |
| 39 | GET | `/api/pending-responses/:id` | YES |
| 40 | GET | `/api/pending-responses/:id/deliver` | YES |
| 41 | GET | `/api/pending-responses/:id/subscribe` | YES |
| 42 | POST | `/api/pending-responses/:id/retry` | YES |

---

**All endpoints tested and verified working as of December 26, 2025**
