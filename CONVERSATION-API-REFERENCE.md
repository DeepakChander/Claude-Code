# Conversation Management API Reference

**Version:** 2.0.0
**Last Updated:** December 27, 2025

---

## Server URLs (HTTPS/WSS)

| Service | URL | Description |
|---------|-----|-------------|
| **Brain API** | `https://13.49.125.60:3456` | Main REST API |
| **WebSocket Hub** | `wss://13.49.125.60:8002/ws` | Real-time WebSocket |
| **Health Check (API)** | `https://13.49.125.60:3456/health` | API health |
| **Health Check (WS)** | `https://13.49.125.60:8002/health` | WebSocket health |

---

## Authentication

All endpoints require authentication. Include ONE of these headers:

| Method | Header | Example |
|--------|--------|---------|
| **API Key** | `X-API-Key` | `X-API-Key: your-api-key-here` |
| **JWT Token** | `Authorization` | `Authorization: Bearer eyJhbGciOiJIUzI1...` |

---

## Conversation Endpoints

### 1. List All Conversations

**Full URL:**
```
GET https://13.49.125.60:3456/api/conversations
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Max results (1-100) |
| `offset` | number | 0 | Pagination offset |
| `archived` | boolean | false | Include archived |
| `sortBy` | string | lastMessageAt | Sort field |
| `sortOrder` | string | desc | asc or desc |

**Example Request:**
```
GET https://13.49.125.60:3456/api/conversations?limit=20&offset=0
Headers:
  X-API-Key: your-api-key
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "conversationId": "ebbab469-8910-4d4a-bdd1-204dcc5153a8",
        "sessionId": "session-1766823652492-phfprm4",
        "projectId": "8d0a3646-57a4-4623-bccb-0d97f82130d8",
        "title": "React Hooks Discussion",
        "messageCount": 8,
        "lastMessageAt": "2025-12-27T08:20:57.915Z",
        "createdAt": "2025-12-26T15:21:46.867Z",
        "isArchived": false,
        "isPinned": true,
        "modelUsed": "anthropic/claude-sonnet-4"
      }
    ],
    "pagination": {
      "total": 25,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

---

### 2. Get Single Conversation

**Full URL:**
```
GET https://13.49.125.60:3456/api/conversations/{conversationId}
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation UUID |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `includeMessages` | boolean | true | Include messages |
| `messageLimit` | number | 100 | Max messages (1-500) |

**Example Request:**
```
GET https://13.49.125.60:3456/api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8?includeMessages=true
Headers:
  X-API-Key: your-api-key
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "conversation": {
      "conversationId": "ebbab469-8910-4d4a-bdd1-204dcc5153a8",
      "sessionId": "session-1766823652492-phfprm4",
      "projectId": "8d0a3646-57a4-4623-bccb-0d97f82130d8",
      "title": "React Hooks Discussion",
      "messageCount": 8,
      "totalTokensUsed": 15072,
      "totalCostUsd": 0.006417,
      "lastMessageAt": "2025-12-27T08:20:57.915Z",
      "createdAt": "2025-12-26T15:21:46.867Z",
      "updatedAt": "2025-12-27T08:20:57.915Z",
      "isArchived": false,
      "isPinned": true,
      "modelUsed": "anthropic/claude-sonnet-4",
      "tags": []
    },
    "messages": [
      {
        "messageId": "8ab3e9d9-1493-46ad-932c-f79a44364b2b",
        "role": "user",
        "content": "What are hooks in React?",
        "createdAt": "2025-12-26T15:21:47.023Z",
        "tokensInput": 0,
        "tokensOutput": 0
      },
      {
        "messageId": "4bac6936-e7fa-44da-a255-0fe17d6f8828",
        "role": "assistant",
        "content": "React hooks are functions that let you use state...",
        "createdAt": "2025-12-26T15:21:58.574Z",
        "tokensInput": 1698,
        "tokensOutput": 315
      }
    ]
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Conversation not found"
  }
}
```

---

### 3. Generate AI Title

**Full URL:**
```
POST https://13.49.125.60:3456/api/conversations/{conversationId}/generate-title
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation UUID |

**Request Body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `regenerate` | boolean | No | false | Force regenerate existing title |

**Example Request:**
```
POST https://13.49.125.60:3456/api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8/generate-title
Headers:
  X-API-Key: your-api-key
  Content-Type: application/json
Body:
{
  "regenerate": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "conversationId": "ebbab469-8910-4d4a-bdd1-204dcc5153a8",
    "title": "React Hooks Best Practices",
    "previousTitle": "New Conversation",
    "generatedAt": "2025-12-27T10:51:59.244Z",
    "model": "claude-haiku-4-5-20250514"
  }
}
```

**Error Response (409):**
```json
{
  "success": false,
  "error": {
    "code": "TITLE_EXISTS",
    "message": "Title already exists. Set regenerate=true to generate a new one."
  },
  "data": {
    "currentTitle": "React Hooks Discussion"
  }
}
```

---

### 4. Update Title Manually

**Full URL:**
```
PUT https://13.49.125.60:3456/api/conversations/{conversationId}/title
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation UUID |

**Request Body:**

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `title` | string | Yes | 1-100 chars | New title |

**Example Request:**
```
PUT https://13.49.125.60:3456/api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8/title
Headers:
  X-API-Key: your-api-key
  Content-Type: application/json
Body:
{
  "title": "My React Learning Session"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "conversationId": "ebbab469-8910-4d4a-bdd1-204dcc5153a8",
    "title": "My React Learning Session",
    "updatedAt": "2025-12-27T10:52:54.325Z"
  }
}
```

---

### 5. Update Conversation (Archive/Pin)

**Full URL:**
```
PATCH https://13.49.125.60:3456/api/conversations/{conversationId}
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation UUID |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `isArchived` | boolean | No | Set archive status |
| `isPinned` | boolean | No | Set pinned status |

At least one field must be provided.

**Example Request - Pin Conversation:**
```
PATCH https://13.49.125.60:3456/api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8
Headers:
  X-API-Key: your-api-key
  Content-Type: application/json
Body:
{
  "isPinned": true
}
```

**Example Request - Archive Conversation:**
```
PATCH https://13.49.125.60:3456/api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8
Headers:
  X-API-Key: your-api-key
  Content-Type: application/json
Body:
{
  "isArchived": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "conversationId": "ebbab469-8910-4d4a-bdd1-204dcc5153a8",
    "isArchived": false,
    "isPinned": true,
    "updatedAt": "2025-12-27T10:54:13.345Z"
  }
}
```

---

### 6. Delete Conversation

**Full URL:**
```
DELETE https://13.49.125.60:3456/api/conversations/{conversationId}
```

**Path Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `conversationId` | string | Yes | Conversation UUID |

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `permanent` | boolean | false | Permanently delete if true |

**Example Request - Soft Delete (Archive):**
```
DELETE https://13.49.125.60:3456/api/conversations/b580f83a-b9b2-44c9-be8d-496338501803
Headers:
  X-API-Key: your-api-key
```

**Example Request - Hard Delete (Permanent):**
```
DELETE https://13.49.125.60:3456/api/conversations/b580f83a-b9b2-44c9-be8d-496338501803?permanent=true
Headers:
  X-API-Key: your-api-key
```

**Success Response (200) - Soft Delete:**
```json
{
  "success": true,
  "data": {
    "conversationId": "b580f83a-b9b2-44c9-be8d-496338501803",
    "action": "archived",
    "deletedAt": "2025-12-27T10:54:51.643Z"
  }
}
```

**Success Response (200) - Hard Delete:**
```json
{
  "success": true,
  "data": {
    "conversationId": "b580f83a-b9b2-44c9-be8d-496338501803",
    "action": "deleted",
    "deletedAt": "2025-12-27T10:54:51.643Z"
  }
}
```

---

## Auto-Generated Titles

When a user sends their first message, the system automatically generates a title.

**How It Works:**

1. User sends first message via chat endpoint
2. AI generates response
3. System checks if title is "New Conversation"
4. If yes, Claude Haiku generates a 5-10 word title
5. Title is saved and returned in response

**Agent Response with Auto-Title:**
```json
{
  "success": true,
  "data": {
    "result": "AI response here...",
    "conversationId": "uuid",
    "sessionId": "session-xxx",
    "conversationTitle": "React Hooks Best Practices",
    "titleGenerated": true,
    "usage": {
      "tokensInput": 1500,
      "tokensOutput": 300,
      "costUsd": 0.005
    }
  }
}
```

---

## WebSocket Connection

**Full URL:**
```
wss://13.49.125.60:8002/ws?token={jwt_token}
```

**Connection Example:**
```javascript
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
const ws = new WebSocket(`wss://13.49.125.60:8002/ws?token=${token}`);

ws.onopen = () => {
  console.log('Connected to WebSocket');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Not authorized to access resource |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `TITLE_EXISTS` | 409 | Title exists, use regenerate=true |
| `NO_MESSAGES` | 400 | No messages to generate title |
| `SERVER_ERROR` | 500 | Internal server error |

---

## Response Fields Reference

### Conversation Object

| Field | Type | Description |
|-------|------|-------------|
| `conversationId` | string | Unique UUID |
| `sessionId` | string | Session ID for resume |
| `projectId` | string | Associated project |
| `title` | string | Chat title (max 500 chars) |
| `messageCount` | number | Total messages |
| `totalTokensUsed` | number | Token usage |
| `totalCostUsd` | number | Total cost |
| `isArchived` | boolean | Archive status |
| `isPinned` | boolean | Pinned status |
| `modelUsed` | string | AI model used |
| `lastMessageAt` | string | ISO timestamp |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Message Object

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | string | Unique UUID |
| `role` | string | "user" or "assistant" |
| `content` | string | Message text |
| `tokensInput` | number | Input tokens |
| `tokensOutput` | number | Output tokens |
| `createdAt` | string | ISO timestamp |

---

## Quick Reference

| Action | Method | Full Endpoint |
|--------|--------|---------------|
| List chats | GET | `https://13.49.125.60:3456/api/conversations` |
| Get chat | GET | `https://13.49.125.60:3456/api/conversations/{id}` |
| Generate title | POST | `https://13.49.125.60:3456/api/conversations/{id}/generate-title` |
| Update title | PUT | `https://13.49.125.60:3456/api/conversations/{id}/title` |
| Pin/Archive | PATCH | `https://13.49.125.60:3456/api/conversations/{id}` |
| Delete | DELETE | `https://13.49.125.60:3456/api/conversations/{id}` |
| WebSocket | WSS | `wss://13.49.125.60:8002/ws?token={token}` |
| Health (API) | GET | `https://13.49.125.60:3456/health` |
| Health (WS) | GET | `https://13.49.125.60:8002/health` |

---

## SSL Certificate Note

The server uses a self-signed SSL certificate. For API clients:

- **curl:** Use `-k` flag to skip certificate verification
- **Node.js/axios:** Set `rejectUnauthorized: false` in HTTPS agent
- **Browser:** Accept the certificate warning once

For production, recommend upgrading to Let's Encrypt certificate with a proper domain.

---

## Support

For issues or questions, contact the backend team.
