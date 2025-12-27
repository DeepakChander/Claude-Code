# Conversation Management API Reference

**Version:** 2.0.0
**Base URL:** `http://13.49.125.60:3456`
**Last Updated:** December 27, 2025

---

## Overview

The Conversation Management API allows frontend applications to manage user chat conversations. It provides endpoints to list, retrieve, update, and delete conversations, as well as generate AI-powered titles for chats.

---

## Authentication

All endpoints require authentication. Use one of the following methods:

| Method | Header | Description |
|--------|--------|-------------|
| API Key | `X-API-Key: <api_key>` | Direct API key authentication |
| JWT Token | `Authorization: Bearer <token>` | JWT token from auth endpoint |

---

## Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List all conversations |
| GET | `/api/conversations/:id` | Get single conversation with messages |
| POST | `/api/conversations/:id/generate-title` | Generate AI-powered title |
| PUT | `/api/conversations/:id/title` | Update title manually |
| PATCH | `/api/conversations/:id` | Update conversation (archive/pin) |
| DELETE | `/api/conversations/:id` | Delete conversation |

---

## 1. List All Conversations

Retrieves all conversations for the authenticated user with pagination support.

**Endpoint:** `GET /api/conversations`

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| limit | number | No | 50 | Maximum results (max: 100) |
| offset | number | No | 0 | Pagination offset |
| archived | boolean | No | false | Include archived conversations |
| sortBy | string | No | lastMessageAt | Sort field |
| sortOrder | string | No | desc | Sort order (asc/desc) |

### Request Example

```
GET /api/conversations?limit=20&offset=0&archived=false
```

### Response

**Success (200 OK):**

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

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| conversationId | string | Unique conversation identifier (UUID) |
| sessionId | string | Session ID for resume functionality |
| projectId | string | Associated project ID |
| title | string | Conversation title (AI-generated or manual) |
| messageCount | number | Total messages in conversation |
| lastMessageAt | string | ISO timestamp of last message |
| createdAt | string | ISO timestamp of creation |
| isArchived | boolean | Whether conversation is archived |
| isPinned | boolean | Whether conversation is pinned |
| modelUsed | string | AI model used for this conversation |

---

## 2. Get Single Conversation

Retrieves a specific conversation with its messages.

**Endpoint:** `GET /api/conversations/:conversationId`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation UUID |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| includeMessages | boolean | No | true | Include messages in response |
| messageLimit | number | No | 100 | Maximum messages (max: 500) |

### Request Example

```
GET /api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8?includeMessages=true&messageLimit=50
```

### Response

**Success (200 OK):**

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
        "content": "What are hooks in React? Explain in 2 sentences.",
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

### Message Fields

| Field | Type | Description |
|-------|------|-------------|
| messageId | string | Unique message identifier (UUID) |
| role | string | Message role: "user" or "assistant" |
| content | string | Message content text |
| createdAt | string | ISO timestamp of message creation |
| tokensInput | number | Input tokens used (for assistant messages) |
| tokensOutput | number | Output tokens used (for assistant messages) |

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Conversation not found |
| 403 | FORBIDDEN | Not authorized to access this conversation |

---

## 3. Generate AI Title

Generates an AI-powered title for a conversation based on the first user message. Uses Claude Haiku for fast, cost-effective generation.

**Endpoint:** `POST /api/conversations/:conversationId/generate-title`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation UUID |

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| regenerate | boolean | No | false | Force regeneration of existing title |

### Request Example

```
POST /api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8/generate-title
Content-Type: application/json

{
  "regenerate": true
}
```

### Response

**Success (200 OK):**

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

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| conversationId | string | Conversation UUID |
| title | string | Newly generated title (5-10 words) |
| previousTitle | string | Previous title before generation |
| generatedAt | string | ISO timestamp of generation |
| model | string | AI model used for generation |

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Conversation not found |
| 400 | NO_MESSAGES | No user messages found to generate title |
| 409 | TITLE_EXISTS | Title already exists (use regenerate=true) |

---

## 4. Update Title Manually

Allows manual update of a conversation title.

**Endpoint:** `PUT /api/conversations/:conversationId/title`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation UUID |

### Request Body

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| title | string | Yes | 1-100 characters | New title for conversation |

### Request Example

```
PUT /api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8/title
Content-Type: application/json

{
  "title": "My React Learning Session"
}
```

### Response

**Success (200 OK):**

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

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Conversation not found |
| 400 | VALIDATION_ERROR | Title is required or invalid length |

---

## 5. Update Conversation (Archive/Pin)

Updates conversation properties like archive status or pinned state.

**Endpoint:** `PATCH /api/conversations/:conversationId`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation UUID |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| isArchived | boolean | No | Set archive status |
| isPinned | boolean | No | Set pinned status |

At least one field must be provided.

### Request Example - Pin Conversation

```
PATCH /api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8
Content-Type: application/json

{
  "isPinned": true
}
```

### Request Example - Archive Conversation

```
PATCH /api/conversations/ebbab469-8910-4d4a-bdd1-204dcc5153a8
Content-Type: application/json

{
  "isArchived": true
}
```

### Response

**Success (200 OK):**

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

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Conversation not found |
| 400 | VALIDATION_ERROR | No valid fields to update |

---

## 6. Delete Conversation

Deletes a conversation. By default, performs a soft delete (archives). Use `permanent=true` for hard delete.

**Endpoint:** `DELETE /api/conversations/:conversationId`

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| conversationId | string | Yes | Conversation UUID |

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| permanent | boolean | No | false | If true, permanently deletes conversation and all messages |

### Request Example - Soft Delete (Archive)

```
DELETE /api/conversations/b580f83a-b9b2-44c9-be8d-496338501803
```

### Request Example - Hard Delete (Permanent)

```
DELETE /api/conversations/b580f83a-b9b2-44c9-be8d-496338501803?permanent=true
```

### Response

**Success (200 OK) - Soft Delete:**

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

**Success (200 OK) - Hard Delete:**

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

### Error Responses

| Status | Code | Description |
|--------|------|-------------|
| 404 | NOT_FOUND | Conversation not found |

---

## Auto-Generated Titles

When a user sends their first message to the AI, the system automatically generates a title for the conversation. This happens transparently in the background.

### How It Works

1. User sends first message via `/api/agent/sdk/run-sync` or similar endpoint
2. AI generates response
3. System checks if conversation title is "New Conversation"
4. If yes, Claude Haiku generates a 5-10 word summary title
5. Title is saved to database
6. Response includes `conversationTitle` and `titleGenerated` fields

### Auto-Title Response Fields

When using agent endpoints, the response includes:

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

| Field | Type | Description |
|-------|------|-------------|
| conversationTitle | string | Current or newly generated title |
| titleGenerated | boolean | true if title was just generated |

---

## Error Response Format

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

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| UNAUTHORIZED | 401 | Missing or invalid authentication |
| FORBIDDEN | 403 | Not authorized to access resource |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid input data |
| SERVER_ERROR | 500 | Internal server error |

---

## Rate Limits

| Limit | Value | Description |
|-------|-------|-------------|
| Requests per minute | 10,000 | Per IP + API key combination |
| Max conversations per request | 100 | Pagination limit |
| Max messages per request | 500 | Message limit |

---

## Database Schema Reference

### Conversations Collection

| Field | Type | Description |
|-------|------|-------------|
| conversationId | String (UUID) | Primary identifier |
| userId | String | User who owns conversation |
| projectId | String | Associated project |
| title | String | Chat title (max 500 chars) |
| sessionId | String | For resume functionality |
| messageCount | Number | Total messages |
| isArchived | Boolean | Soft delete flag |
| isPinned | Boolean | Pin to top |
| totalTokensUsed | Number | Total token usage |
| totalCostUsd | Number | Total cost |
| lastMessageAt | Date | Last activity timestamp |
| createdAt | Date | Creation timestamp |
| updatedAt | Date | Last update timestamp |

### Messages Collection

| Field | Type | Description |
|-------|------|-------------|
| messageId | String (UUID) | Primary identifier |
| conversationId | String | Parent conversation |
| role | String | "user" or "assistant" |
| content | String | Message text |
| tokensInput | Number | Input tokens |
| tokensOutput | Number | Output tokens |
| costUsd | Number | Message cost |
| createdAt | Date | Creation timestamp |

---

## Quick Start for Frontend

### 1. List User's Chats

```
GET /api/conversations
Headers: X-API-Key: <your-api-key>
```

### 2. Open a Chat

```
GET /api/conversations/<conversationId>
Headers: X-API-Key: <your-api-key>
```

### 3. Rename a Chat

```
PUT /api/conversations/<conversationId>/title
Headers: X-API-Key: <your-api-key>
Body: { "title": "New Chat Name" }
```

### 4. Pin/Unpin a Chat

```
PATCH /api/conversations/<conversationId>
Headers: X-API-Key: <your-api-key>
Body: { "isPinned": true }
```

### 5. Delete a Chat

```
DELETE /api/conversations/<conversationId>
Headers: X-API-Key: <your-api-key>
```

---

## Support

For issues or questions, contact the backend team or create an issue in the repository.
