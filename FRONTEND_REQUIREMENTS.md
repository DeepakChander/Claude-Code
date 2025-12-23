# Frontend Requirements for IDE Integration

> **Document Purpose**: Define the contract between Backend and Frontend teams for the AI Coding Assistant IDE integration.

---

## 1. Overview

The backend will provide a **WebSocket server** that streams AI responses, tool executions, and progress updates in real-time. The frontend (Desktop IDE) must implement a WebSocket client and UI components to display these events.

```
┌──────────────────┐         WebSocket          ┌──────────────────┐
│   BACKEND        │  ◄────────────────────────►│   FRONTEND       │
│   (We provide)   │     JSON Messages          │   (You build)    │
└──────────────────┘                            └──────────────────┘
```

---

## 2. What Backend Provides

### 2.1 WebSocket Endpoint

| Property | Value |
|----------|-------|
| **URL** | `ws://server:3456/ws` (dev) / `wss://api.openanalyst.com/ws` (prod) |
| **Protocol** | JSON over WebSocket |
| **Authentication** | Send JWT token after connection |

### 2.2 Events Frontend Will Receive

| Event Type | Description | When Sent |
|------------|-------------|-----------|
| `connected` | Connection established | On WebSocket open |
| `thinking` | AI is reasoning | Before AI generates response |
| `text` | Streaming text content | While AI is typing |
| `todo_created` | Todo list created | When AI plans multi-step task |
| `task_started` | Task execution began | When working on a todo item |
| `task_completed` | Task finished | When todo item done |
| `tool_use` | AI wants to execute a tool | Before tool execution |
| `approval_needed` | Waiting for user approval | For Write/Edit/Bash tools |
| `tool_result` | Tool execution result | After tool executes |
| `terminal_output` | Command stdout/stderr | During Bash execution |
| `complete` | Response finished | End of AI response |
| `error` | Error occurred | On any error |

### 2.3 Message Format (Server → Client)

```typescript
interface ServerMessage {
  type: string;           // Event type from table above
  sessionId: string;      // Session identifier
  timestamp: string;      // ISO timestamp
  data: {
    // Content varies by type - see Section 4
  };
}
```

---

## 3. What Frontend Must Implement

### 3.1 WebSocket Client

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://server:3456/ws');

// Authenticate after connection
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'authenticate',
    payload: { token: 'JWT_TOKEN_HERE' }
  }));
};

// Handle incoming messages
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleServerMessage(message);
};
```

### 3.2 Messages Frontend Must Send

| Action | Message Format |
|--------|----------------|
| **Authenticate** | `{ type: 'authenticate', payload: { token: 'JWT' } }` |
| **Send Chat** | `{ type: 'chat', payload: { prompt: 'user message', sessionId: 'xxx', projectId: 'yyy' } }` |
| **Approve Tool** | `{ type: 'approve', payload: { toolCallId: 'xxx' } }` |
| **Reject Tool** | `{ type: 'reject', payload: { toolCallId: 'xxx', reason: 'optional reason' } }` |
| **Subscribe Session** | `{ type: 'subscribe', payload: { sessionId: 'xxx' } }` |

---

## 4. Event Data Structures

### 4.1 `thinking` Event

```json
{
  "type": "thinking",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:00Z",
  "data": {
    "content": "Let me analyze the codebase structure..."
  }
}
```

**Frontend Action**: Display gray/italic "thinking" text with loading indicator.

---

### 4.2 `text` Event (Streaming)

```json
{
  "type": "text",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:01Z",
  "data": {
    "content": "I'll create a",
    "delta": " Node.js"
  }
}
```

**Frontend Action**: Append `delta` to chat message in real-time.

---

### 4.3 `todo_created` Event

```json
{
  "type": "todo_created",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:02Z",
  "data": {
    "todos": [
      { "id": "todo-1", "content": "Create package.json", "status": "pending" },
      { "id": "todo-2", "content": "Create server.js", "status": "pending" },
      { "id": "todo-3", "content": "Create routes folder", "status": "pending" }
    ]
  }
}
```

**Frontend Action**: Display checkbox-style progress list.

---

### 4.4 `task_started` / `task_completed` Events

```json
{
  "type": "task_started",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:03Z",
  "data": {
    "todoId": "todo-1",
    "content": "Create package.json"
  }
}
```

**Frontend Action**: Update todo item status: `pending` → `in_progress` → `completed`.

---

### 4.5 `approval_needed` Event ⚠️ CRITICAL

```json
{
  "type": "approval_needed",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:04Z",
  "data": {
    "toolCallId": "tool-abc-123",
    "toolName": "Write",
    "description": "Create file: package.json",
    "preview": {
      "filePath": "package.json",
      "content": "{\n  \"name\": \"my-api\",\n  \"version\": \"1.0.0\"\n}"
    }
  }
}
```

**Frontend Action**: 
1. Show approval dialog with file preview
2. User clicks "Approve" → Send `approve` message
3. User clicks "Reject" → Send `reject` message

---

### 4.6 `tool_result` Event

```json
{
  "type": "tool_result",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:05Z",
  "data": {
    "toolCallId": "tool-abc-123",
    "toolName": "Write",
    "success": true,
    "output": "File created: package.json"
  }
}
```

**Frontend Action**: Update file tree, show success notification.

---

### 4.7 `terminal_output` Event

```json
{
  "type": "terminal_output",
  "sessionId": "session-123",
  "timestamp": "2025-12-23T12:00:06Z",
  "data": {
    "command": "npm install",
    "output": "added 50 packages in 2s",
    "isComplete": false
  }
}
```

**Frontend Action**: Stream output to embedded terminal (xterm.js).

---

## 5. UI Components Required

### 5.1 Chat Panel

| Feature | Requirement |
|---------|-------------|
| Text Input | Multiline input with Enter to send |
| Message List | Show user messages and AI responses |
| Streaming Display | Append text character-by-character |
| Thinking Indicator | Show "💭 Thinking..." with spinner |
| Markdown Rendering | Render code blocks, lists, etc. |

### 5.2 Todo/Progress Panel

| Feature | Requirement |
|---------|-------------|
| Checkbox List | Display todo items with status icons |
| Status Icons | ○ pending, ⟳ in_progress, ✓ completed, ✗ failed |
| Real-time Updates | Update status when events arrive |
| Collapsible | Can expand/collapse the panel |

### 5.3 Approval Dialog

| Feature | Requirement |
|---------|-------------|
| Modal Overlay | Centered dialog over IDE |
| File Preview | Show file path and content with syntax highlighting |
| Diff View (for Edit) | Show before/after diff |
| Actions | "Approve" (green) and "Reject" (red) buttons |
| Keyboard | Enter = Approve, Escape = Reject |

### 5.4 Embedded Terminal

| Feature | Requirement |
|---------|-------------|
| Terminal Emulator | Use xterm.js or similar |
| Output Streaming | Display command output in real-time |
| Read-only Mode | User cannot type (AI controls) |
| Scroll | Auto-scroll to bottom on new output |

---

## 6. Recommended Libraries

| Component | Recommended Library |
|-----------|---------------------|
| WebSocket Client | Native WebSocket API or `socket.io-client` |
| Markdown | `react-markdown` or `marked` |
| Code Highlight | `prism-react-renderer` or `highlight.js` |
| Diff View | `react-diff-viewer` or `monaco-editor` diff |
| Terminal | `xterm.js` + `xterm-addon-fit` |
| Icons | `lucide-react` or `react-icons` |

---

## 7. State Management

Frontend should maintain:

```typescript
interface IDEState {
  // Connection
  isConnected: boolean;
  sessionId: string | null;
  
  // Chat
  messages: ChatMessage[];
  isThinking: boolean;
  streamingContent: string;
  
  // Todos
  todos: TodoItem[];
  
  // Approvals
  pendingApproval: ApprovalRequest | null;
  
  // Terminal
  terminalOutput: string;
}
```

---

## 8. Error Handling

| Error Type | Frontend Action |
|------------|-----------------|
| Connection Lost | Show reconnect banner, auto-retry |
| Auth Failed | Redirect to login |
| Tool Failed | Show error toast, highlight failed todo |
| AI Error | Display error in chat |

---

## 9. Testing Checklist

- [ ] Can connect to WebSocket and authenticate
- [ ] Chat messages send and receive correctly
- [ ] Streaming text appears character-by-character
- [ ] Todo list displays and updates in real-time
- [ ] Approval dialog appears for Write/Edit/Bash
- [ ] Approve/Reject buttons work
- [ ] Terminal shows command output
- [ ] Reconnects on connection loss

---

## 10. Contact

| Role | Contact |
|------|---------|
| **Backend Team** | (Your contact info) |
| **API Questions** | Slack #api-support |
| **WebSocket Issues** | Check server logs at `pm2 logs` |

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-23
