# IDE Integration Architecture Reference

> **Goal**: Integrate OpenAnalyst chat endpoint with Desktop IDE to provide Claude Code / Antigravity-like AI coding assistant experience.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DESKTOP IDE APPLICATION                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │  Chat Panel │  │   Editor    │  │  Terminal   │  │  Todo List  │     │
│  │  (Chat UI)  │  │   (Monaco)  │  │  (xterm.js) │  │  (Progress) │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │                │            │
│         └────────────────┴────────────────┴────────────────┘            │
│                                   │                                      │
│                          WebSocket Client                                │
│                                   │                                      │
└───────────────────────────────────┼──────────────────────────────────────┘
                                    │
                        ┌───────────▼───────────┐
                        │   WebSocket (wss://)  │
                        │   ws://server:3456/ws │
                        └───────────┬───────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────────────┐
│                        BACKEND SERVER                                    │
│  ┌─────────────────┐  ┌───────────▼───────────┐  ┌─────────────────┐    │
│  │  HTTP/SSE API   │  │  WebSocket Service    │  │  Agent Service  │    │
│  │ /api/agent/...  │  │  (websocket.service)  │  │ (agent-sdk)     │    │
│  └────────┬────────┘  └───────────┬───────────┘  └────────┬────────┘    │
│           │                       │                       │             │
│           └───────────────────────┴───────────────────────┘             │
│                                   │                                      │
│                        ┌──────────▼──────────┐                          │
│                        │   OpenRouter API    │                          │
│                        │   (Claude/GPT/etc)  │                          │
│                        └─────────────────────┘                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Research Summary

### 2.1 Vercel AI SDK

| Aspect | Finding |
|--------|---------|
| **Default Streaming** | Uses SSE (Server-Sent Events) via `streamText()` |
| **WebSocket Support** | Not built-in; requires custom implementation |
| **Best For** | Next.js/React apps with `useChat` hook |
| **Our Use Case** | Can use for streaming logic, but need custom WS layer |

**Recommendation**: Use Vercel AI SDK concepts (streamText patterns) but implement custom WebSocket streaming for Desktop IDE.

### 2.2 IDE Integration Patterns (Cursor / Claude Code)

| Pattern | Implementation |
|---------|----------------|
| **Context Awareness** | Index project structure, send to AI |
| **Multi-file Understanding** | Include relevant files in prompt |
| **Agent Mode** | AI plans steps (todo) → executes → reports |
| **IDE Plugin** | WebSocket client in IDE connects to backend |
| **Inline Diffs** | AI sends diff patches, IDE displays in editor |

### 2.3 Human-in-the-Loop (HITL) Approval

| Action Type | Approval Flow |
|-------------|---------------|
| **Create File** | AI → `tool_use: Write` → Wait for user approval → Execute |
| **Edit File** | AI → `tool_use: Edit` → Show diff → Wait → Apply |
| **Run Terminal** | AI → `tool_use: Bash` → Show command → Wait → Execute |
| **Read File** | Usually auto-approved (safe) |

---

## 3. WebSocket Message Protocol

### 3.1 Client → Server Messages

```typescript
interface ClientMessage {
  type: 'chat' | 'approve' | 'reject' | 'subscribe';
  payload: {
    // For 'chat'
    prompt?: string;
    sessionId?: string;
    projectId?: string;
    
    // For 'approve'/'reject'
    toolCallId?: string;
    
    // For 'subscribe'
    sessionId?: string;
  };
}
```

### 3.2 Server → Client Messages

```typescript
interface ServerMessage {
  type: 
    | 'thinking'        // AI is reasoning
    | 'text'            // Streaming text content
    | 'todo_created'    // Todo list created
    | 'task_started'    // Task began execution
    | 'task_completed'  // Task finished
    | 'tool_use'        // AI wants to use a tool
    | 'tool_result'     // Tool execution result
    | 'approval_needed' // Waiting for user approval
    | 'terminal_output' // Command output
    | 'complete'        // Stream finished
    | 'error';          // Error occurred
  
  sessionId: string;
  timestamp: string;
  
  data: {
    // For 'text' / 'thinking'
    content?: string;
    
    // For 'todo_created'
    todos?: Array<{
      id: string;
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
    }>;
    
    // For 'tool_use' / 'approval_needed'
    toolName?: string;
    toolInput?: Record<string, unknown>;
    toolCallId?: string;
    requiresApproval?: boolean;
    
    // For 'terminal_output'
    command?: string;
    output?: string;
    exitCode?: number;
  };
}
```

---

## 4. Implementation Plan

### Phase 1: WebSocket Chat Endpoint

**Files to Modify:**
- `backend/src/services/websocket.service.ts` - Add chat handling
- `backend/src/services/agent-sdk.service.ts` - Add WebSocket streaming mode

**New Features:**
1. Handle `chat` message type on WebSocket
2. Stream AI responses via WebSocket instead of SSE
3. Broadcast `thinking`, `text`, `tool_use` events

### Phase 2: Tool Approval Workflow

**Files to Modify:**
- `backend/src/services/agent-sdk.service.ts`
- `backend/src/models/pending-approvals.model.ts` (new)

**New Features:**
1. When AI calls `Write`, `Edit`, or `Bash` → send `approval_needed`
2. Store pending tool call in memory/DB
3. Wait for `approve` or `reject` from client
4. Execute tool on approval, send result

### Phase 3: Todo List Integration

**Files to Modify:**
- `backend/src/services/task-progress.service.ts`
- `backend/src/services/websocket.service.ts`

**New Features:**
1. When AI calls `TodoWrite` → broadcast `todo_created` to IDE
2. As each task progresses → broadcast `task_started`, `task_completed`
3. IDE displays checkbox-style progress in real-time

### Phase 4: Terminal Relay

**Files to Modify:**
- `backend/src/services/terminal.service.ts` (new)

**New Features:**
1. Execute commands on server
2. Stream stdout/stderr to IDE via WebSocket
3. IDE displays in embedded terminal (xterm.js)

---

## 5. Example Flow: "Create a Node.js API"

```
┌─────────────────────────────────────────────────────────────────────┐
│ User (IDE Chat)                                                      │
│ ────────────────                                                     │
│ > Create a Node.js API with Express and MongoDB                      │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ WS: {type:'chat', prompt:...}
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Server                                                       │
│ ──────────────                                                       │
│ 1. Send prompt to OpenRouter/Claude                                  │
│ 2. Stream 'thinking' events → IDE shows "💭 Planning..."            │
│ 3. AI returns TodoWrite tool_use                                     │
│ 4. Broadcast 'todo_created' → IDE shows checkbox list               │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ WS: {type:'todo_created',...}
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IDE Todo Panel                                                       │
│ ──────────────                                                       │
│ 📋 Progress Updates:                                                 │
│   ○ 1. Create package.json with dependencies                         │
│   ○ 2. Create server.js with Express setup                          │
│   ○ 3. Create routes/api.js with CRUD endpoints                     │
│   ○ 4. Create models/user.model.js                                  │
└─────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Server (continues)                                           │
│ ──────────────                                                       │
│ 5. AI returns Write tool for package.json                           │
│ 6. Broadcast 'approval_needed' → IDE shows approval dialog          │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ WS: {type:'approval_needed',...}
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IDE Approval Dialog                                                  │
│ ────────────────                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ AI wants to create file:                                        │ │
│ │                                                                 │ │
│ │ 📄 package.json                                                 │ │
│ │ ┌───────────────────────────────────────────────────────────┐   │ │
│ │ │ {                                                          │   │ │
│ │ │   "name": "node-api",                                      │   │ │
│ │ │   "dependencies": {                                        │   │ │
│ │ │     "express": "^4.18.2",                                  │   │ │
│ │ │     "mongoose": "^8.0.0"                                   │   │ │
│ │ │   }                                                        │   │ │
│ │ │ }                                                          │   │ │
│ │ └───────────────────────────────────────────────────────────┘   │ │
│ │                                                                 │ │
│ │           [✓ Approve]          [✗ Reject]                       │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ WS: {type:'approve', toolCallId:...}
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Server (executes)                                            │
│ ──────────────                                                       │
│ 7. Write package.json to disk                                        │
│ 8. Broadcast 'tool_result' → IDE updates file tree                  │
│ 9. Broadcast 'task_completed' for todo item 1                        │
│ 10. Continue with next tool...                                       │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ WS: {type:'task_completed',...}
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ IDE Todo Panel (updated)                                             │
│ ──────────────                                                       │
│ 📋 Progress Updates:                                                 │
│   ✓ 1. Create package.json with dependencies                         │
│   ⟳ 2. Create server.js with Express setup                          │
│   ○ 3. Create routes/api.js with CRUD endpoints                     │
│   ○ 4. Create models/user.model.js                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Backend Server** | Node.js + Express | API and WebSocket server |
| **WebSocket** | ws library | Real-time bidirectional communication |
| **AI Provider** | OpenRouter → Claude/GPT | LLM for code generation |
| **Streaming** | Custom WS protocol | Real-time streaming to IDE |
| **IDE Client** | Electron + React | Desktop application |
| **Editor** | Monaco Editor | Code editing with syntax highlight |
| **Terminal** | xterm.js | Embedded terminal emulator |
| **Chat UI** | Custom React | Chat interface with streaming |

---

## 7. Next Steps

1. **[PRIORITY]** Extend `websocket.service.ts` to handle chat messages
2. **[PRIORITY]** Add approval workflow for Write/Edit/Bash tools
3. Create IDE WebSocket client library
4. Build chat panel UI with streaming support
5. Integrate todo list display
6. Add terminal relay feature

---

## 8. Alternative: Using Vercel AI SDK

If you want to use Vercel AI SDK for the streaming logic:

```typescript
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Can use Vercel AI SDK's streamText for AI call
const result = await streamText({
  model: openai('gpt-4'),
  prompt: userMessage,
});

// But stream via WebSocket instead of HTTP
for await (const chunk of result.textStream) {
  ws.send(JSON.stringify({ type: 'text', content: chunk }));
}
```

This gives you Vercel AI SDK's structured streaming but delivers via WebSocket.

---

## 9. Context Management (Chat History)

### 9.1 How Context Works

The AI needs to remember previous messages to understand follow-up queries.

```
Session: session-12345
├── Message 1: User: "Create a Node.js API"
├── Message 2: AI: "I'll create the following files..."
├── Message 3: [Tool: Write package.json] ✓
├── Message 4: [Tool: Write server.js] ✓
├── Message 5: User: "Add a /users endpoint"  ← Follow-up query
└── Message 6: AI: "I'll add the users endpoint..." ← AI understands context
```

### 9.2 Context Storage Structure

```typescript
// Backend stores conversation history per session
interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  
  // For assistant messages with tool calls
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  
  // For tool result messages
  tool_call_id?: string;
  name?: string;  // Tool name
}

// Session context
interface SessionContext {
  sessionId: string;
  projectId: string;
  workspacePath: string;
  messages: ConversationMessage[];
  currentTodos: TodoItem[];
  createdAt: Date;
  lastActiveAt: Date;
}
```

### 9.3 Context Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTEXT MANAGEMENT                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┼───────────────────────────────┐
    │                               │                               │
    ▼                               ▼                               ▼
┌─────────┐                   ┌─────────┐                     ┌─────────┐
│ In-Memory │                 │ MongoDB │                     │  Redis  │
│   Map     │                 │  (Long) │                     │ (Cache) │
│           │                 │         │                     │         │
│ Fast      │      Persist    │ Resume  │     Quick Access    │ Session │
│ Access    │ ───────────────►│ Later   │ ◄─────────────────► │ Lookups │
└─────────┘                   └─────────┘                     └─────────┘

// Current implementation uses in-memory Map
const conversationHistory = new Map<string, ConversationMessage[]>();
```

---

## 10. Query Handling Flow

### 10.1 When User Sends a Query

```typescript
// Step 1: Receive query via WebSocket
ws.on('message', async (data) => {
  const msg = JSON.parse(data);
  
  if (msg.type === 'chat') {
    const { prompt, sessionId, projectId } = msg.payload;
    
    // Step 2: Get or create session context
    let messages = conversationHistory.get(sessionId) || [];
    
    // Step 3: Add user message to history
    messages.push({ role: 'user', content: prompt });
    
    // Step 4: Build system prompt with project context
    const systemPrompt = buildSystemPrompt(projectId, workspacePath);
    
    // Step 5: Call AI with full context
    const response = await callAI(systemPrompt, messages);
    
    // Step 6: Stream response via WebSocket
    streamResponseToClient(ws, sessionId, response);
  }
});
```

### 10.2 System Prompt Structure

```typescript
function buildSystemPrompt(projectId: string, workspacePath: string): string {
  return `You are an AI coding assistant integrated into an IDE.

## Workspace
- Project: ${projectId}
- Path: ${workspacePath}

## Available Tools
1. **TodoWrite** - Create a todo list before complex tasks
2. **Read** - Read file contents
3. **Write** - Create or overwrite a file (requires user approval)
4. **Edit** - Edit part of a file (requires user approval)
5. **Bash** - Run shell commands (requires user approval)
6. **Glob** - Find files by pattern
7. **Grep** - Search in files
8. **ListDir** - List directory contents

## Workflow Rules
1. For multi-step tasks, ALWAYS create a TodoWrite first
2. Wait for user approval before Write/Edit/Bash operations
3. Report progress after each step
4. Handle errors gracefully and suggest fixes

## Response Format
- Use markdown for formatting
- Show code in fenced code blocks with language
- Be concise but thorough`;
}
```

### 10.3 How AI Solves Queries

```
User Query: "Add authentication using JWT"
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI Analysis (Internal Reasoning)                                    │
│ ─────────────────────────────────                                   │
│ 1. This is a multi-step task → Need TodoWrite first                │
│ 2. Context shows existing Express server in project                │
│ 3. Need to: install packages, create middleware, update routes     │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ AI Response (Streaming)                                              │
│ ─────────────────────────────────                                   │
│ "I'll add JWT authentication to your Express app. Let me plan      │
│ the steps first."                                                   │
│                                                                     │
│ [Tool Call: TodoWrite]                                              │
│ {                                                                   │
│   "todos": [                                                        │
│     { "content": "Install jsonwebtoken and bcryptjs packages" },   │
│     { "content": "Create auth middleware in middleware/auth.js" }, │
│     { "content": "Add login route in routes/auth.js" },            │
│     { "content": "Protect routes with auth middleware" }           │
│   ]                                                                 │
│ }                                                                   │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Backend Broadcasts to IDE                                            │
│ ─────────────────────────────────                                   │
│ 1. {type: 'thinking', data: {content: 'Analyzing codebase...'}}    │
│ 2. {type: 'text', data: {content: "I'll add JWT..."}}              │
│ 3. {type: 'todo_created', data: {todos: [...]}}                    │
│ 4. {type: 'task_started', data: {todoId: 'todo-1'}}                │
│ 5. {type: 'approval_needed', data: {toolName: 'Bash', ...}}        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Backend Implementation Code

### 11.1 WebSocket Chat Handler

Add this to `websocket.service.ts`:

```typescript
import { runChatStreamingWS } from './agent-sdk.service';

// In handleMessage() method
case 'chat': {
  const { prompt, sessionId, projectId } = message.payload;
  
  // Validate
  if (!prompt || !sessionId) {
    client.ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Missing prompt or sessionId' }
    }));
    return;
  }
  
  // Subscribe client to this session
  client.sessionId = sessionId;
  
  // Call AI and stream response
  try {
    await runChatStreamingWS(
      prompt,
      sessionId,
      projectId || 'default',
      client.ws,
      client.userId
    );
  } catch (error) {
    client.ws.send(JSON.stringify({
      type: 'error',
      sessionId,
      data: { message: (error as Error).message }
    }));
  }
  break;
}
```

### 11.2 AI Streaming via WebSocket

Add this to `agent-sdk.service.ts`:

```typescript
import { WebSocket } from 'ws';

export async function runChatStreamingWS(
  prompt: string,
  sessionId: string,
  projectId: string,
  ws: WebSocket,
  userId: string
): Promise<void> {
  
  // Get or create message history
  let messages = conversationHistory.get(sessionId) || [];
  
  // Add user message
  messages.push({ role: 'user', content: prompt });
  
  // Build system prompt
  const systemPrompt = buildSystemPrompt(projectId, workspacePath);
  
  // Send thinking indicator
  ws.send(JSON.stringify({
    type: 'thinking',
    sessionId,
    timestamp: new Date().toISOString(),
    data: { content: 'Analyzing your request...' }
  }));
  
  // Call OpenRouter/Claude
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      tools: toolDefinitions,
    }),
  });
  
  // Stream response
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const data = JSON.parse(line.slice(6));
      
      // Handle text content
      if (data.choices?.[0]?.delta?.content) {
        ws.send(JSON.stringify({
          type: 'text',
          sessionId,
          timestamp: new Date().toISOString(),
          data: { 
            content: data.choices[0].delta.content,
            delta: data.choices[0].delta.content 
          }
        }));
      }
      
      // Handle tool calls
      if (data.choices?.[0]?.delta?.tool_calls) {
        const toolCall = data.choices[0].delta.tool_calls[0];
        
        // Check if needs approval
        const needsApproval = ['Write', 'Edit', 'Bash'].includes(toolCall.function.name);
        
        if (needsApproval) {
          ws.send(JSON.stringify({
            type: 'approval_needed',
            sessionId,
            timestamp: new Date().toISOString(),
            data: {
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              toolInput: JSON.parse(toolCall.function.arguments),
              requiresApproval: true
            }
          }));
          
          // Wait for approval (store pending and return)
          pendingApprovals.set(toolCall.id, { toolCall, sessionId, ws });
          return;
        }
      }
    }
  }
  
  // Save conversation
  conversationHistory.set(sessionId, messages);
  
  // Send complete
  ws.send(JSON.stringify({
    type: 'complete',
    sessionId,
    timestamp: new Date().toISOString(),
    data: {}
  }));
}
```

### 11.3 Approval Handler

```typescript
// In websocket.service.ts handleMessage()

case 'approve': {
  const { toolCallId } = message.payload;
  const pending = pendingApprovals.get(toolCallId);
  
  if (!pending) {
    client.ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'No pending approval found' }
    }));
    return;
  }
  
  // Execute the tool
  const result = await executeToolLocally(
    pending.toolCall.function.name,
    JSON.parse(pending.toolCall.function.arguments),
    workspacePath
  );
  
  // Send result
  pending.ws.send(JSON.stringify({
    type: 'tool_result',
    sessionId: pending.sessionId,
    timestamp: new Date().toISOString(),
    data: {
      toolCallId,
      toolName: pending.toolCall.function.name,
      success: result.success,
      output: result.output,
      error: result.error
    }
  }));
  
  // Update todo if applicable
  broadcastTaskCompleted(pending.sessionId, pending.toolCall.function.name);
  
  // Continue AI processing with tool result
  pendingApprovals.delete(toolCallId);
  break;
}

case 'reject': {
  const { toolCallId, reason } = message.payload;
  const pending = pendingApprovals.get(toolCallId);
  
  if (pending) {
    pending.ws.send(JSON.stringify({
      type: 'tool_result',
      sessionId: pending.sessionId,
      timestamp: new Date().toISOString(),
      data: {
        toolCallId,
        toolName: pending.toolCall.function.name,
        success: false,
        output: '',
        error: `User rejected: ${reason || 'No reason provided'}`
      }
    }));
    
    pendingApprovals.delete(toolCallId);
  }
  break;
}
```

---

## 12. Implementation Checklist

### Phase 1: Core WebSocket Chat (Week 1)

- [ ] Add `chat` message handler to `websocket.service.ts`
- [ ] Create `runChatStreamingWS()` function in `agent-sdk.service.ts`
- [ ] Stream `thinking`, `text`, `complete` events
- [ ] Test with simple chat queries

### Phase 2: Tool Approval (Week 2)

- [ ] Add `approval_needed` event for Write/Edit/Bash
- [ ] Store pending approvals in Map
- [ ] Add `approve`/`reject` message handlers
- [ ] Execute tools after approval
- [ ] Test file creation with approval flow

### Phase 3: Todo Integration (Week 3)

- [ ] Broadcast `TodoWrite` as `todo_created` event
- [ ] Track todo item status
- [ ] Send `task_started`/`task_completed` events
- [ ] Test multi-step tasks

### Phase 4: Terminal & Polish (Week 4)

- [ ] Stream Bash command output to IDE
- [ ] Add reconnection handling
- [ ] Add session resume capability
- [ ] Performance testing
- [ ] Documentation

---

## 13. Testing Commands

### Test WebSocket Connection

```javascript
// Browser console or Node.js
const ws = new WebSocket('ws://localhost:3456/ws');

ws.onopen = () => {
  console.log('Connected');
  
  // Authenticate
  ws.send(JSON.stringify({
    type: 'authenticate',
    payload: { token: 'YOUR_JWT_TOKEN' }
  }));
  
  // Send chat
  ws.send(JSON.stringify({
    type: 'chat',
    payload: {
      prompt: 'Create a hello.txt file with "Hello World"',
      sessionId: 'test-session-123',
      projectId: 'default'
    }
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

---

**Document Version**: 2.0  
**Last Updated**: 2025-12-23  
**Status**: Ready for Implementation
