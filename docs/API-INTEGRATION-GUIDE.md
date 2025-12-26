# OpenAnalyst API Integration Guide

This guide explains how to integrate with the OpenAnalyst REST API. No code is included - only structures, payloads, and responses.

---

## Base Information

| Item | Value |
|------|-------|
| **Base URL** | `https://api.openanalyst.com` |
| **API Key** | `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |
| **Content Type** | `application/json` |
| **Protocol** | HTTPS (SSL/TLS encrypted) |

---

## Authentication

### Method 1: API Key (Recommended for IDE)

Add this header to ALL requests that require authentication:

| Header Name | Header Value |
|-------------|--------------|
| `X-API-Key` | `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |

### Method 2: JWT Token

If you need user-specific tracking, first get a JWT token, then use it in the Authorization header.

| Header Name | Header Value |
|-------------|--------------|
| `Authorization` | `Bearer <your-jwt-token>` |

---

## Which Endpoints Need Authentication?

| Endpoint | Authentication Required |
|----------|------------------------|
| `/health` | NO |
| `/` | NO |
| `/api/auth/token` | NO |
| `/api/auth/verify` | NO |
| `/api/skills` | NO |
| `/api/search` | NO |
| `/api/agent/*` | **YES** |
| `/api/pending-responses/*` | **YES** |

---

## Step-by-Step Integration

---

### Step 1: Test Connection (No Auth Required)

**Purpose:** Verify the API is reachable

**Endpoint:** `GET /health`

**Request:**
| Part | Value |
|------|-------|
| Method | GET |
| URL | `https://api.openanalyst.com/health` |
| Headers | None required |
| Body | None |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | "ok" if healthy |
| `timestamp` | string | Current server time |
| `version` | string | API version (2.0.0) |
| `service` | string | "openanalyst-api" |
| `database.connected` | boolean | Database connection status |

---

### Step 2: Get JWT Token (Optional)

**Purpose:** Get a token for user-specific tracking

**Endpoint:** `POST /api/auth/token`

**Request:**
| Part | Value |
|------|-------|
| Method | POST |
| URL | `https://api.openanalyst.com/api/auth/token` |
| Headers | `Content-Type: application/json` |

**Request Body Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | YES | Unique identifier for the user |
| `email` | string | NO | User's email address |
| `apiKey` | string | YES | The master API key |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `data.token` | string | JWT token to use for authentication |
| `data.expiresIn` | string | Token validity period ("7d") |
| `data.expiresAt` | string | Exact expiration timestamp |
| `data.userId` | string | The userId you provided |

**Important:** Save the `data.token` value. You will need it for WebSocket connection.

---

### Step 3: Send Query to AI Agent

**Purpose:** Send a question and get AI response

**Endpoint:** `POST /api/agent/run-sync`

**Request:**
| Part | Value |
|------|-------|
| Method | POST |
| URL | `https://api.openanalyst.com/api/agent/run-sync` |
| Headers | `Content-Type: application/json` |
| Headers | `X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |

**Request Body Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | YES | The question or task for the AI |
| `projectId` | string | NO | Project identifier (default: "default") |
| `model` | string | NO | AI model to use |
| `systemPrompt` | string | NO | Custom instructions for the AI |
| `maxTurns` | number | NO | Maximum conversation turns |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `data.result` | string | The AI's response text |
| `data.conversationId` | string | ID to continue this conversation |
| `data.sessionId` | string | Session ID for resume functionality |

---

### Step 4: Continue a Conversation

**Purpose:** Send follow-up message in same conversation

**Endpoint:** `POST /api/agent/sdk/continue-sync`

**Request:**
| Part | Value |
|------|-------|
| Method | POST |
| URL | `https://api.openanalyst.com/api/agent/sdk/continue-sync` |
| Headers | `Content-Type: application/json` |
| Headers | `X-API-Key: <your-api-key>` |

**Request Body Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | YES | Follow-up question |
| `conversationId` | string | YES | The conversationId from previous response |

**Response:** Same structure as Step 3

---

### Step 5: List User's Conversations

**Purpose:** Get all conversations for the authenticated user

**Endpoint:** `GET /api/agent/conversations`

**Request:**
| Part | Value |
|------|-------|
| Method | GET |
| URL | `https://api.openanalyst.com/api/agent/conversations` |
| Headers | `X-API-Key: <your-api-key>` |
| Body | None |

**Optional Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `archived` | boolean | Include archived conversations |
| `limit` | number | Maximum results to return |
| `offset` | number | Pagination offset |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `data` | array | List of conversation objects |
| `data[].conversationId` | string | Unique conversation ID |
| `data[].title` | string | Conversation title |
| `data[].messageCount` | number | Number of messages |
| `data[].lastMessageAt` | string | Last activity timestamp |
| `data[].createdAt` | string | Creation timestamp |

---

### Step 6: Get Messages in a Conversation

**Purpose:** Retrieve all messages from a specific conversation

**Endpoint:** `GET /api/agent/conversations/{conversationId}/messages`

**Request:**
| Part | Value |
|------|-------|
| Method | GET |
| URL | `https://api.openanalyst.com/api/agent/conversations/{conversationId}/messages` |
| Headers | `X-API-Key: <your-api-key>` |

Replace `{conversationId}` with the actual conversation ID.

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `data` | array | List of message objects |
| `data[].messageId` | string | Unique message ID |
| `data[].role` | string | "user" or "assistant" |
| `data[].content` | string | Message text |
| `data[].createdAt` | string | Message timestamp |

---

### Step 7: Web Search

**Purpose:** Search the web and get AI-summarized results

**Endpoint:** `POST /api/search`

**Request:**
| Part | Value |
|------|-------|
| Method | POST |
| URL | `https://api.openanalyst.com/api/search` |
| Headers | `Content-Type: application/json` |
| Body | See below |

**Request Body Structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | YES | Search query |
| `maxResults` | number | NO | Maximum results (default: 5) |
| `searchDepth` | string | NO | "basic" or "advanced" |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `query` | string | Your search query |
| `answer` | string | AI-generated summary of results |
| `results` | array | List of search results |
| `results[].title` | string | Page title |
| `results[].url` | string | Page URL |
| `results[].content` | string | Page excerpt |
| `results[].score` | number | Relevance score (0-1) |
| `count` | number | Number of results |

---

### Step 8: List Available Skills

**Purpose:** Get all available AI skills

**Endpoint:** `GET /api/skills`

**Request:**
| Part | Value |
|------|-------|
| Method | GET |
| URL | `https://api.openanalyst.com/api/skills` |
| Headers | None required |

**Response You Will Get:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `skills` | array | List of skill objects |
| `skills[].name` | string | Skill name |
| `skills[].description` | string | What the skill does |
| `skills[].type` | string | Skill type |
| `skills[].allowedTools` | array | Tools the skill can use |
| `count` | number | Total number of skills |

---

## Error Responses

When something goes wrong, you will receive this structure:

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | false |
| `error.code` | string | Error code (see table below) |
| `error.message` | string | Human-readable error description |

### Error Codes

| Code | HTTP Status | Meaning | Solution |
|------|-------------|---------|----------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key | Add X-API-Key header |
| `VALIDATION_ERROR` | 400 | Missing required field | Check request body |
| `NOT_FOUND` | 404 | Resource not found | Check URL/ID |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `INTERNAL_ERROR` | 500 | Server error | Contact support |

---

## Required Headers Summary

### For Endpoints WITHOUT Authentication

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` (for POST requests) |

### For Endpoints WITH Authentication

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` (for POST requests) |
| `X-API-Key` | `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |

---

## Complete Endpoint List

### No Authentication Required

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Check API health |
| GET | `/` | Get API info |
| POST | `/api/auth/token` | Get JWT token |
| POST | `/api/auth/verify` | Verify JWT token |
| GET | `/api/skills` | List all skills |
| GET | `/api/skills/{name}` | Get skill details |
| POST | `/api/skills/match` | Match skills to prompt |
| GET | `/api/search/status` | Check search configuration |
| POST | `/api/search` | Web search |
| POST | `/api/search/research` | Research a topic |

### Authentication Required (Add X-API-Key Header)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/agent/health` | Check agent health |
| POST | `/api/agent/run-sync` | Run agent (get JSON response) |
| POST | `/api/agent/run` | Run agent (streaming response) |
| POST | `/api/agent/sdk/run-sync` | Run SDK agent (JSON) |
| POST | `/api/agent/sdk/run` | Run SDK agent (streaming) |
| POST | `/api/agent/sdk/continue-sync` | Continue conversation (JSON) |
| POST | `/api/agent/sdk/continue` | Continue conversation (streaming) |
| POST | `/api/agent/orchestrate` | Orchestrated request |
| GET | `/api/agent/conversations` | List conversations |
| GET | `/api/agent/conversations/{id}` | Get conversation details |
| GET | `/api/agent/conversations/{id}/messages` | Get messages |
| GET | `/api/agent/resumable` | List resumable conversations |
| POST | `/api/agent/resume/{id}` | Resume conversation (streaming) |
| POST | `/api/agent/resume/{id}/sync` | Resume conversation (JSON) |
| GET | `/api/agent/skills` | Get agent skills |
| GET | `/api/agent/usage` | Get usage statistics |
| POST | `/api/agent/compact` | Compact conversation |
| GET | `/api/pending-responses` | List pending responses |
| GET | `/api/pending-responses/counts` | Get status counts |
| GET | `/api/pending-responses/deliver` | Deliver completed responses |
| GET | `/api/pending-responses/{id}` | Get specific response |
| POST | `/api/pending-responses/{id}/retry` | Retry failed request |

---

## Quick Reference Card

### To Send a Query

```
POST https://api.openanalyst.com/api/agent/run-sync

Headers:
  Content-Type: application/json
  X-API-Key: 714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1

Body:
  {
    "prompt": "Your question here"
  }

Response:
  {
    "success": true,
    "data": {
      "result": "AI response here",
      "conversationId": "conversation-id"
    }
  }
```

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
