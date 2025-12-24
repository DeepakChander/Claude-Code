# 🔌 OpenAnalyst API: IDE Integration Guide

This guide details how to integrate the OpenAnalyst backend into an IDE (VS Code, JetBrains, etc.).

## 🌐 Endpoints Overview

| Service | Protocol | URL Pattern | Description |
| :--- | :--- | :--- | :--- |
| **API Base** | HTTPS | `https://api.openanalyst.com:3456` | Core REST API for Auth and Agent Control |
| **Real-time** | WSS | `wss://api.openanalyst.com:3456/ws` | Live event stream (Thinking, Output, User Input Requests) |

> **✅ Security Note**: The API is secured with a **Trusted Let's Encrypt Certificate**. No special client configuration is required.


All requests require a JWT Token.

### Generate Token
**POST** `/api/auth/token`
```json
{
  "userId": "user-123",  // Unique ID for your IDE user
  "apiKey": "your-master-api-key"
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "expiresIn": "7d"
  }
}
```
> **Action**: Store this `token`. Add it to the header of **ALL** subsequent HTTP and WebSocket requests: `Authorization: Bearer <TOKEN>`

---

## 🚀 2. Start Agent Loop (The "Single Endpoint")
This is the main entry point to start a task. The backend handles the complexity; you just stream the response.

**POST** `/api/agent/run`
**Headers**: `Authorization: Bearer <TOKEN>`, `Accept: text/event-stream`

**Body**:
```json
{
  "prompt": "Create a new React component called Header",
  "projectId": "my-project-root", // Use the open folder path or ID
  "allowedTools": ["Read", "Write", "Bash", "Glob"], // Optional constraints
  "model": "claude-3-5-sonnet-20241022"
}
```

### Handling the Response (Server-Sent Events)
The server streams events as they happen. You need to listen for these event types:

| Event Type | Data Payload | IDE Action |
| :--- | :--- | :--- |
| `thinking` | `{ "content": "Analyzing request..." }` | Show a spinner or "Thinking..." status. |
| `text` | `{ "content": "I will create the file..." }` | Display text in the chat window (markdown supported). |
| **`tool_use`** | `{ "tool": "Write", "input": { ... }, "id": "call_123" }` | **CRITICAL**: The Agent wants to run a tool (e.g., save a file). See Section 3. |
| `user_input` | `{ "prompt": "Please confirm..." }` | Show an input box to the user to get feedback. |
| `error` | `{ "message": "Failed to..." }` | Show error toast. |
| `stop` | `{}` | Task complete. Hide spinner. |

---

## 🛠️ 3. Handling Tool Execution (Client-Side)
When the backend sends a `tool_use` event, **IT IS PAUSED**. It waits for YOU (the IDE) to execute the tool and send back the result.

**Example Flow**:
1.  **Backend** sends: `event: tool_use`, `data: { "tool": "Write", "input": { "file_path": "Header.tsx", "content": "..." }, "id": "call_99" }`
2.  **IDE** (You):
    *   Parse the input.
    *   Write the file to the local disk.
    *   Capture result (Success or Error).
3.  **IDE**: **POST** `/api/agent/sdk/chat/tools` to report back.

### Submit Tool Result
**POST** `/api/agent/sdk/chat/tools`
**Headers**: `Authorization: Bearer <TOKEN>`

**Body**:
```json
{
  "toolCallId": "call_99", // Must match the ID received
  "result": "Successfully wrote file" // Or error message
}
```
*The Agent will automatically resume after receiving this confirmation.*

---

## 📡 4. Real-time Status (WebSocket)
**URL**: `wss://16.171.8.128:3456/ws`
**Headers**: `Authorization: Bearer <TOKEN>`

Connect to this WebSocket to receive global updates, such as background task progress or cross-device notifications. It mirrors the SSE stream but is bi-directional if you need to send async interrupts.

### Messages
*   **Client -> Server**:
    *   `{ "type": "ping" }` (Keep-alive)
*   **Server -> Client**:
    *   `{ "type": "connection", "status": "connected" }`
    *   `{ "type": "progress", "message": "Installing dependencies...", "percent": 50 }`

---

## 📚 Summary Checklist for IDE Team
1.  [ ] **SSL Trust**: Configure HTTP client to accept self-signed certs.
2.  [ ] **Auth**: Get JWT and store it.
3.  [ ] **Chat UI**: POST to `/api/agent/run` and render the SSE stream.
4.  [ ] **Tooling**: Implement a handler for `tool_use` events that performs filesystem operations and posts results back.



