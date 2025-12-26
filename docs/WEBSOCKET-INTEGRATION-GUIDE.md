# OpenAnalyst WebSocket Integration Guide

This guide explains how to integrate with the OpenAnalyst WebSocket for real-time communication. No code is included - only structures, payloads, and responses.

---

## Base Information

| Item | Value |
|------|-------|
| **WebSocket URL** | `wss://api.openanalyst.com/ws` |
| **Health Check URL** | `http://13.49.125.60:8002/health` |
| **Protocol** | WSS (WebSocket Secure) |
| **Heartbeat Interval** | 30 seconds |

---

## Important: WebSocket Requires JWT Token

Unlike the REST API which accepts API Key, WebSocket requires a **JWT Token**.

You MUST get a JWT token first before connecting to WebSocket.

---

## Step-by-Step Integration

---

### Step 1: Get JWT Token (Required Before WebSocket)

**Purpose:** Get authentication token for WebSocket connection

**Where:** REST API (not WebSocket)

**Endpoint:** `POST https://api.openanalyst.com/api/auth/token`

**Request Headers:**

| Header | Value |
|--------|-------|
| `Content-Type` | `application/json` |

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | YES | Unique identifier for your user |
| `email` | string | NO | User's email address |
| `apiKey` | string | YES | `714ed5871abaea99811747d8a34577c8c0929359cf7e2a2e2e27aca562c0eab1` |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if successful |
| `data.token` | string | **This is your JWT token - SAVE IT** |
| `data.expiresIn` | string | "7d" (7 days) |
| `data.expiresAt` | string | Exact expiration date/time |
| `data.userId` | string | Your userId |

**Save the `data.token` value - you need it for the next step.**

---

### Step 2: Connect to WebSocket

**Purpose:** Establish real-time connection

**Connection URL Format:**

```
wss://api.openanalyst.com/ws?token=YOUR_JWT_TOKEN_HERE
```

**Important Points:**

| Point | Explanation |
|-------|-------------|
| Token Location | The JWT token goes in the URL as a query parameter |
| Parameter Name | `token` |
| NOT in Headers | WebSocket does not support custom headers on connection |
| NOT in Body | Token must be in URL, not in any message body |

**Example URL Structure:**

```
wss://api.openanalyst.com/ws?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyMTIzIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiaWF0IjoxNzY2NzQ3NjAzLCJleHAiOjE3NjczNTI0MDN9.xxxxx
```

---

### Step 3: Receive Connection Confirmation

**Purpose:** Know that you are successfully connected

**When:** Immediately after successful connection

**Message You Will Receive:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `CONNECTED` |
| `userId` | string | Your user ID |
| `sessionId` | string | **Your session ID - SAVE THIS** |
| `payload.message` | string | "Connected to OpenAnalyst" |
| `payload.sessionId` | string | Same session ID |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

**Save the `sessionId` - you may need it for conversation tracking.**

---

### Step 4: Send a Query to AI Agent

**Purpose:** Ask the AI a question

**Message To Send:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | YES | Must be exactly `USER_REQUEST` |
| `payload` | object | YES | Contains your message |
| `payload.content` | string | YES | Your question or message |
| `payload.conversationId` | string | NO | Include to continue existing conversation |
| `payload.metadata` | object | NO | Additional context |

**Payload Structure:**

```
{
  "type": "USER_REQUEST",
  "payload": {
    "content": "What is React?",
    "conversationId": "optional-conversation-id",
    "metadata": {
      "source": "vscode-ide",
      "language": "javascript"
    }
  }
}
```

---

### Step 5: Receive Responses

After sending a query, you will receive multiple messages in sequence:

---

#### Response 1: Typing Indicator

**When:** Immediately after your query is received

**Message Structure:**

| Field | Type | Value/Description |
|-------|------|-------------------|
| `type` | string | `ASSISTANT_TYPING` |
| `payload.typing` | boolean | true |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |
| `correlationId` | string | Links to your original message |

**What It Means:** The AI has received your query and is processing it.

---

#### Response 2: Streaming Chunks (Multiple Messages)

**When:** As the AI generates response

**You Will Receive Multiple Messages Like This:**

| Field | Type | Value/Description |
|-------|------|-------------------|
| `type` | string | `ASSISTANT_CHUNK` |
| `payload.content` | string | Part of the response |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |
| `correlationId` | string | Links to your original message |

**What It Means:** These are pieces of the response as they are generated. Concatenate them to build the full response.

**Example Sequence:**

| Message # | payload.content |
|-----------|-----------------|
| 1 | "React is a " |
| 2 | "JavaScript library " |
| 3 | "for building " |
| 4 | "user interfaces." |

---

#### Response 3: Complete Response

**When:** After all chunks are sent

**Message Structure:**

| Field | Type | Value/Description |
|-------|------|-------------------|
| `type` | string | `ASSISTANT_RESPONSE` |
| `payload.messageId` | string | Message ID |
| `payload.content` | string | Full response text |
| `payload.done` | boolean | true |
| `payload.metadata.skill` | string | Skill used |
| `payload.metadata.duration` | number | Processing time in ms |
| `payload.metadata.tokens` | number | Tokens used |
| `timestamp` | number | Unix timestamp |
| `correlationId` | string | Links to your original message |

**What It Means:** The AI has finished responding. `payload.done: true` confirms completion.

---

### Step 6: Keep Connection Alive (Heartbeat)

**Purpose:** Prevent connection timeout

**When To Send:** Every 25-30 seconds

**Message To Send:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | YES | Must be exactly `PING` |
| `payload` | object | YES | Empty object `{}` |

**Structure:**

```
{
  "type": "PING",
  "payload": {}
}
```

**Response You Will Receive:**

| Field | Type | Value/Description |
|-------|------|-------------------|
| `type` | string | `PONG` |
| `payload.timestamp` | number | Server timestamp |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

## All Message Types Reference

---

### Messages You Send (Client → Server)

| Type | Purpose | Required Fields |
|------|---------|-----------------|
| `USER_REQUEST` | Send query to AI | `payload.content` |
| `PING` | Keep connection alive | `payload: {}` |

---

### Messages You Receive (Server → Client)

| Type | When | Key Fields |
|------|------|------------|
| `CONNECTED` | After connecting | `sessionId` |
| `ASSISTANT_TYPING` | AI is processing | `payload.typing` |
| `ASSISTANT_CHUNK` | Streaming response | `payload.content` |
| `ASSISTANT_RESPONSE` | Response complete | `payload.content`, `payload.done` |
| `TASK_PROGRESS` | Long task update | `payload.taskId`, `payload.progress` |
| `TASK_COMPLETE` | Task finished | `payload.taskId`, `payload.result` |
| `TASK_ERROR` | Task failed | `payload.message` |
| `PONG` | Response to PING | `payload.timestamp` |
| `ERROR` | Error occurred | `payload.message` |

---

## Message Structures in Detail

---

### USER_REQUEST (You Send)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | YES | `"USER_REQUEST"` |
| `payload` | object | YES | Message payload |
| `payload.content` | string | YES | Your question/message |
| `payload.conversationId` | string | NO | To continue conversation |
| `payload.attachments` | array | NO | File paths or content |
| `payload.metadata` | object | NO | Additional context |
| `payload.metadata.source` | string | NO | Where request came from |
| `payload.metadata.language` | string | NO | Programming language context |

---

### CONNECTED (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"CONNECTED"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.message` | string | Welcome message |
| `payload.sessionId` | string | Your session ID (duplicate) |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

### ASSISTANT_TYPING (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"ASSISTANT_TYPING"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.typing` | boolean | Always true |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |
| `correlationId` | string | Links to your request |

---

### ASSISTANT_CHUNK (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"ASSISTANT_CHUNK"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.content` | string | Part of the response |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |
| `correlationId` | string | Links to your request |

---

### ASSISTANT_RESPONSE (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"ASSISTANT_RESPONSE"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.messageId` | string | Response message ID |
| `payload.content` | string | Full response text |
| `payload.done` | boolean | true when complete |
| `payload.metadata` | object | Response metadata |
| `payload.metadata.skill` | string | Skill that was used |
| `payload.metadata.duration` | number | Processing time in ms |
| `payload.metadata.tokens` | number | Tokens used |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |
| `correlationId` | string | Links to your request |

---

### TASK_PROGRESS (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"TASK_PROGRESS"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.taskId` | string | Task identifier |
| `payload.status` | string | "pending", "running", "completed", "failed" |
| `payload.progress` | number | Progress percentage (0-100) |
| `payload.message` | string | Status message |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

### TASK_COMPLETE (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"TASK_COMPLETE"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.taskId` | string | Task identifier |
| `payload.status` | string | "completed" |
| `payload.result` | object | Task result data |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

### TASK_ERROR (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"TASK_ERROR"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.taskId` | string | Task identifier |
| `payload.status` | string | "failed" |
| `payload.message` | string | Error description |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

### ERROR (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"ERROR"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.message` | string | Error description |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

### PONG (You Receive)

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"PONG"` |
| `userId` | string | Your user ID |
| `sessionId` | string | Your session ID |
| `payload.timestamp` | number | Server timestamp |
| `timestamp` | number | Unix timestamp |
| `messageId` | string | Unique message ID |

---

## Connection Close Codes

If the WebSocket connection closes, check the close code:

| Code | Meaning | Solution |
|------|---------|----------|
| 1000 | Normal closure | Intentional disconnect - no action needed |
| 1001 | Going away | Server is shutting down - reconnect later |
| 4001 | Authentication required | You did not provide token in URL |
| 4002 | Invalid token | Your token is expired or invalid - get new token |

---

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| Close code 4001 | No token in URL | Add `?token=YOUR_TOKEN` to WebSocket URL |
| Close code 4002 | Token expired | Get new token from `/api/auth/token` |
| No PONG received | Connection may be dead | Reconnect to WebSocket |
| Connection refused | Server not running | Check health endpoint first |
| "Invalid JSON message" | Malformed message | Check your message structure |
| "Message content is required" | Missing content | Add `payload.content` field |

---

## Complete Flow Summary

```
1. Get JWT Token
   ─────────────
   POST /api/auth/token
   Body: { userId, email, apiKey }
   Save: data.token

2. Connect to WebSocket
   ────────────────────
   URL: wss://api.openanalyst.com/ws?token=YOUR_TOKEN
   Wait for: CONNECTED message
   Save: sessionId

3. Send Query
   ──────────
   Send: { type: "USER_REQUEST", payload: { content: "Your question" } }

4. Receive Response
   ─────────────────
   Receive: ASSISTANT_TYPING (AI is processing)
   Receive: ASSISTANT_CHUNK (multiple times, build response)
   Receive: ASSISTANT_RESPONSE (final, done: true)

5. Keep Alive
   ──────────
   Every 25-30 seconds:
   Send: { type: "PING", payload: {} }
   Receive: PONG
```

---

## Token Lifecycle

| Event | Action |
|-------|--------|
| IDE starts | Get JWT token from REST API |
| Connect WebSocket | Use token in URL: `?token=JWT` |
| Token expires (7 days) | Get new token, reconnect |
| Connection drops | Reconnect with same token if not expired |

---

## Important Notes

1. **Token in URL:** The JWT token MUST be in the WebSocket URL as `?token=`, not in headers or body

2. **Save sessionId:** The sessionId from CONNECTED message is useful for tracking

3. **Heartbeat Required:** Send PING every 25-30 seconds or connection will timeout

4. **Build Response from Chunks:** ASSISTANT_CHUNK messages are parts of response - concatenate them

5. **Check done Flag:** Response is complete when you receive ASSISTANT_RESPONSE with `payload.done: true`

6. **Handle Reconnection:** If connection drops, get new token if expired, then reconnect

---

**Document Version:** 1.0
**Last Updated:** December 26, 2025
