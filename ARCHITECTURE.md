# OpenAnalyst - Multi-User Architecture & Data Privacy

This document explains how OpenAnalyst manages multiple users, ensures data privacy, and handles logging.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [User Identity & Authentication](#user-identity--authentication)
3. [Data Isolation Architecture](#data-isolation-architecture)
4. [Request Flow - How User A's Data Never Reaches User B](#request-flow)
5. [WebSocket Connection Management](#websocket-connection-management)
6. [Database Schema & User Binding](#database-schema--user-binding)
7. [Logging System](#logging-system)
8. [Security Measures](#security-measures)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND IDEs                                   │
│                                                                              │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│   │  User A  │    │  User B  │    │  User C  │    │  User D  │              │
│   │  IDE     │    │  IDE     │    │  IDE     │    │  IDE     │              │
│   └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘              │
│        │               │               │               │                     │
└────────┼───────────────┼───────────────┼───────────────┼─────────────────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY (NGINX)                                  │
│                     https://api.openanalyst.com                              │
│                                                                              │
│  - SSL/TLS Termination                                                       │
│  - Load Balancing                                                            │
│  - Reverse Proxy                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BRAIN SERVICE                                   │
│                          (13.49.125.60:3456)                                 │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │  Auth Middleware │───▶│  User Context   │───▶│  Route Handler  │          │
│  │  (JWT/API Key)  │    │  Extraction     │    │  (Agent/Skills) │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            WEBSOCKET HUB                                     │
│                          (13.49.125.60:8002)                                 │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    CONNECTION MANAGER                            │        │
│  │                                                                  │        │
│  │  connections: Map<userId, Set<AuthenticatedSocket>>              │        │
│  │  sessionToUser: Map<sessionId, userId>                           │        │
│  │                                                                  │        │
│  │  User A ──▶ [Socket1, Socket2]    (2 tabs open)                  │        │
│  │  User B ──▶ [Socket3]             (1 tab open)                   │        │
│  │  User C ──▶ [Socket4, Socket5]    (2 tabs open)                  │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATABASE                                        │
│                             (MongoDB)                                        │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐           │
│  │  conversations   │  │    messages      │  │ pending_responses│           │
│  │  ─────────────── │  │  ─────────────── │  │ ─────────────────│           │
│  │  userId (indexed)│  │  conversationId  │  │  userId (indexed)│           │
│  │  conversationId  │  │  role            │  │  correlationId   │           │
│  │  sessionId       │  │  content         │  │  status          │           │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. User Identity & Authentication

### How Users Are Identified

Every user in the system is identified by a unique `userId`. This ID is:

1. **Provided by the IDE** when requesting a JWT token
2. **Embedded in the JWT token** after authentication
3. **Extracted from every request** via middleware
4. **Used to filter all database queries**

### Authentication Flow

```
Step 1: IDE Requests JWT Token
─────────────────────────────
POST /api/auth/token
{
  "userId": "user-abc-123",        ◄── IDE provides unique user ID
  "email": "user@company.com",
  "apiKey": "master-api-key"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ1c2VyLWFiYy0xMjMi..."
                                   └── userId embedded in token
}


Step 2: Every Request Carries User Identity
───────────────────────────────────────────
GET /api/agent/conversations
Headers:
  X-API-Key: master-api-key

OR

  Authorization: Bearer eyJhbGciOiJIUzI1NiJ9...


Step 3: Middleware Extracts userId
──────────────────────────────────
Auth Middleware:
  1. Check X-API-Key header → userId = "api-key-user"
  2. Check Bearer token → Decode JWT → Extract userId
  3. Attach userId to request object

Request now has:
  req.user = {
    userId: "user-abc-123",
    email: "user@company.com"
  }


Step 4: All Operations Use userId
─────────────────────────────────
Database Query:
  Conversation.find({ userId: "user-abc-123" })

NOT:
  Conversation.find({})  ◄── This would expose all users' data!
```

---

## 3. Data Isolation Architecture

### How Data Is Separated

Every piece of data in the system is bound to a `userId`. There is no shared data between users.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE COLLECTIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CONVERSATIONS COLLECTION                                                    │
│  ─────────────────────────                                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ { conversationId: "conv-001", userId: "user-A", title: "React..." } │   │
│  │ { conversationId: "conv-002", userId: "user-A", title: "Python..." }│   │
│  │ { conversationId: "conv-003", userId: "user-B", title: "Java..." }  │   │
│  │ { conversationId: "conv-004", userId: "user-C", title: "Go..." }    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  When User A requests conversations:                                         │
│    Query: { userId: "user-A" }                                               │
│    Result: Only conv-001, conv-002                                           │
│                                                                              │
│  When User B requests conversations:                                         │
│    Query: { userId: "user-B" }                                               │
│    Result: Only conv-003                                                     │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MESSAGES COLLECTION                                                         │
│  ───────────────────                                                         │
│  Messages are linked to conversations via conversationId.                    │
│  Since conversations are user-bound, messages are also user-bound.           │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ { messageId: "msg-001", conversationId: "conv-001", content: "..." } │   │
│  │ { messageId: "msg-002", conversationId: "conv-001", content: "..." } │   │
│  │ { messageId: "msg-003", conversationId: "conv-003", content: "..." } │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  User A can only see messages for conv-001, conv-002 (their conversations)  │
│  User B can only see messages for conv-003 (their conversations)            │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PENDING_RESPONSES COLLECTION                                                │
│  ────────────────────────────                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ { correlationId: "corr-001", userId: "user-A", status: "pending" }   │   │
│  │ { correlationId: "corr-002", userId: "user-B", status: "completed" } │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  User A can only see corr-001                                                │
│  User B can only see corr-002                                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Indexes for User Isolation

All collections have `userId` as an indexed field for:
1. **Performance:** Fast queries filtered by user
2. **Security:** Ensures all queries include userId filter

```
conversations collection:
  - Index: { userId: 1, isArchived: 1, lastMessageAt: -1 }
  - Index: { userId: 1, isPinned: -1, lastMessageAt: -1 }

pending_responses collection:
  - Index: { userId: 1, status: 1, expiresAt: 1 }
```

---

## 4. Request Flow - How User A's Data Never Reaches User B

### Complete Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    USER A SENDS A QUERY                                      │
└─────────────────────────────────────────────────────────────────────────────┘

Step 1: IDE Sends Request
─────────────────────────
User A's IDE:
  POST /api/agent/run-sync
  Headers:
    X-API-Key: master-api-key
  Body:
    { "prompt": "What is React?" }


Step 2: Auth Middleware
───────────────────────
authMiddleware(req, res, next):
  - Extract X-API-Key from headers
  - Validate against MASTER_API_KEY
  - Set req.user = { userId: "api-key-user", email: "api@openanalyst.com" }
  - Call next()

If using JWT:
  - Extract token from Authorization header
  - Verify JWT signature
  - Decode payload: { userId: "user-A", email: "userA@company.com" }
  - Set req.user = { userId: "user-A", email: "userA@company.com" }


Step 3: Route Handler
─────────────────────
agentController.runSync(req, res):
  const userId = req.user.userId;  // "user-A"

  // Create or find conversation FOR THIS USER ONLY
  const conversation = await conversationRepo.findOrCreateByProject(
    userId,      // "user-A"
    projectId
  );

  // Query executed:
  // Conversation.findOne({ userId: "user-A", workspacePath: projectId })


Step 4: AI Agent Processing
───────────────────────────
claudeCodeService.runAgent():
  - Process prompt
  - Generate response
  - Track tokens/cost per conversation (which is user-bound)


Step 5: Save Message
────────────────────
messageRepo.create({
  conversationId: conversation.conversationId,  // Bound to user-A
  role: "assistant",
  content: "React is a JavaScript library..."
});


Step 6: Return Response
───────────────────────
Response sent ONLY to User A's connection:
{
  "success": true,
  "data": {
    "result": "React is a JavaScript library...",
    "conversationId": "conv-user-a-001"
  }
}


┌─────────────────────────────────────────────────────────────────────────────┐
│  USER B NEVER SEES THIS DATA BECAUSE:                                        │
│  1. User B has different userId                                              │
│  2. All queries filter by userId                                             │
│  3. WebSocket sends responses only to the requesting user's connection       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. WebSocket Connection Management

### How WebSocket Isolates Users

The WebSocket Hub maintains a map of userId → connections:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION MANAGER                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  connections: Map<userId, Set<Socket>>                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  "user-A"  ──▶  [ Socket-1 (tab 1), Socket-2 (tab 2) ]                │  │
│  │  "user-B"  ──▶  [ Socket-3 ]                                          │  │
│  │  "user-C"  ──▶  [ Socket-4, Socket-5, Socket-6 ]                      │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  sessionToUser: Map<sessionId, userId>                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  "session-001"  ──▶  "user-A"                                         │  │
│  │  "session-002"  ──▶  "user-A"                                         │  │
│  │  "session-003"  ──▶  "user-B"                                         │  │
│  │  "session-004"  ──▶  "user-C"                                         │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  sendToUser(userId, message):                                                │
│    - Get all sockets for this userId                                         │
│    - Send message to ONLY those sockets                                      │
│    - Other users' sockets are NOT touched                                    │
│                                                                              │
│  sendToSession(sessionId, message):                                          │
│    - Look up userId from sessionToUser map                                   │
│    - Find the specific socket with this sessionId                            │
│    - Send message to ONLY that socket                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### WebSocket Message Routing

```
User A sends query via WebSocket:
  { type: "USER_REQUEST", payload: { content: "What is React?" } }

WebSocket Hub:
  1. Receives message on Socket-1 (User A)
  2. Socket-1 has userId: "user-A", sessionId: "session-001"
  3. Enriches message with user info
  4. Forwards to Brain service via Redis

Brain service processes and responds via Redis:
  { type: "ASSISTANT_RESPONSE", userId: "user-A", sessionId: "session-001", ... }

WebSocket Hub receives response:
  1. Looks at userId: "user-A"
  2. Gets connections for "user-A" → [Socket-1, Socket-2]
  3. Sends response to Socket-1 and Socket-2 ONLY
  4. User B's Socket-3 NEVER receives this message
```

---

## 6. Database Schema & User Binding

### Conversation Model

```javascript
{
  conversationId: "conv-abc-123",      // Unique conversation ID
  userId: "user-A",                     // ◄── USER BINDING
  projectId: "default",
  title: "React Hooks Discussion",
  sessionId: "claude-session-xyz",      // For resume functionality
  modelUsed: "claude-sonnet-4",
  totalTokensUsed: 1500,
  totalCostUsd: 0.025,
  messageCount: 10,
  isArchived: false,
  createdAt: "2025-12-26T10:00:00Z",
  updatedAt: "2025-12-26T11:00:00Z"
}
```

### Message Model

```javascript
{
  messageId: "msg-abc-123",
  conversationId: "conv-abc-123",       // Links to user's conversation
  role: "assistant",
  content: "React hooks are...",
  tokensInput: 50,
  tokensOutput: 200,
  modelUsed: "claude-sonnet-4",
  costUsd: 0.005,
  createdAt: "2025-12-26T10:05:00Z"
}
```

### Pending Response Model

```javascript
{
  correlationId: "corr-abc-123",
  userId: "user-A",                     // ◄── USER BINDING
  conversationId: "conv-abc-123",
  requestPayload: {
    prompt: "What is React?",
    model: "claude-sonnet-4"
  },
  status: "completed",
  response: {
    content: "React is...",
    tokens: 250
  },
  createdAt: "2025-12-26T10:00:00Z",
  expiresAt: "2025-12-27T10:00:00Z"
}
```

---

## 7. Logging System

### Log Files Location

```
Server: 13.49.125.60 (Brain Service)
Path: /home/ubuntu/openanalyst/services/brain/logs/

├── application-2025-12-26.log    # All application logs
├── application-2025-12-25.log
├── error-2025-12-26.log          # Error logs only
├── error-2025-12-25.log
├── exceptions-2025-12-26.log     # Uncaught exceptions
└── rejections-2025-12-26.log     # Unhandled promise rejections
```

### Log Rotation Settings

| Setting | Value |
|---------|-------|
| Date Pattern | YYYY-MM-DD (daily rotation) |
| Max File Size | 20 MB |
| Max Files (application) | 14 days |
| Max Files (error) | 30 days |
| Max Files (exceptions) | 30 days |

### Log Format

```
2025-12-26 14:30:45.123 [INFO]: Agent query started {"conversationId":"conv-123","promptLength":50,"userId":"user-A"}
2025-12-26 14:30:47.456 [INFO]: Tool execution: web_search {"conversationId":"conv-123","status":"success","duration":2100}
2025-12-26 14:30:48.789 [INFO]: Conversation updated {"conversationId":"conv-123"}
2025-12-26 14:30:49.012 [ERROR]: Failed to process request {"userId":"user-B","error":"Rate limit exceeded"}
```

### What Gets Logged

| Event | Log Level | Information Logged |
|-------|-----------|-------------------|
| Request received | INFO | Method, path, userId, IP |
| Conversation created | INFO | conversationId, userId |
| Agent query started | INFO | conversationId, promptLength, userId |
| Tool execution | INFO | toolName, conversationId, status, duration |
| Message saved | DEBUG | messageId, conversationId |
| Error occurred | ERROR | userId, error message, stack trace |
| WebSocket connected | INFO | userId, sessionId, IP |
| WebSocket disconnected | INFO | userId, sessionId, reason |

### Privacy in Logs

```
Production Mode:
  - Full prompts are NOT logged (only promptLength)
  - Stack traces are hidden
  - Only metadata is logged

Example:
  ✓ "Agent query started" {"promptLength":150,"userId":"user-A"}
  ✗ "Agent query started" {"prompt":"What is my password...","userId":"user-A"}
```

### Viewing Logs

```bash
# SSH into Brain server
ssh -i "Brian-WSHub.pem" ubuntu@13.49.125.60

# View latest logs
tail -f ~/openanalyst/services/brain/logs/application-$(date +%Y-%m-%d).log

# View error logs
tail -f ~/openanalyst/services/brain/logs/error-$(date +%Y-%m-%d).log

# Search for specific user
grep "user-A" ~/openanalyst/services/brain/logs/application-*.log
```

---

## 8. Security Measures

### Authentication Security

| Layer | Protection |
|-------|------------|
| API Key | Master key required for all authenticated endpoints |
| JWT Token | Signed with secret, expires in 7 days |
| HTTPS | All traffic encrypted via SSL/TLS |
| CORS | Origin validation for browser requests |

### Data Access Security

| Protection | Implementation |
|------------|----------------|
| User Isolation | All queries filtered by userId |
| Database Indexes | Compound indexes include userId |
| WebSocket Isolation | Responses sent only to user's sockets |
| Session Binding | sessionId mapped to userId |

### What Prevents User A from Seeing User B's Data

1. **Authentication:** User must provide valid API key or JWT
2. **User Context:** Every request has userId attached by middleware
3. **Query Filtering:** All database queries include userId filter
4. **WebSocket Routing:** Messages sent only to authenticated user's connections
5. **No Shared Data:** There is no "public" or shared conversation space

### Attack Prevention

| Attack | Prevention |
|--------|------------|
| Token Forgery | JWT signed with secret key |
| Session Hijacking | Tokens expire, HTTPS required |
| Data Leakage | All queries include userId filter |
| Cross-User Access | No API endpoint returns data without userId filter |

---

## Summary

### Key Points

1. **Every user has a unique userId** provided during authentication
2. **All data is bound to userId** in the database
3. **Every database query filters by userId** - no exceptions
4. **WebSocket sends responses only to the authenticated user's connections**
5. **Logs are stored on server** with daily rotation and 14-30 day retention
6. **Privacy is protected** - full prompts are not logged in production

### Data Flow Summary

```
User Request → Auth Middleware → Extract userId → Query with userId filter
                                                           ↓
                                          Response sent to only that user
```

This architecture ensures complete data isolation between users. User A can never see User B's conversations, messages, or pending responses.
