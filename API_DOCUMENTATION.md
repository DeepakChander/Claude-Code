# OpenAnalyst API Documentation

## Overview

OpenAnalyst API exposes Claude Code as a REST API with JWT authentication, streaming support, and database persistence.

---

## User Guides

| Guide | Description |
|-------|-------------|
| **[Localhost Guide](docs/LOCALHOST_GUIDE.md)** | Run API on your local machine |
| **[AWS EC2 Guide](docs/AWS_USER_GUIDE.md)** | Deploy API on AWS for global access |

---

## Quick Start

### Localhost

```bash
# Start server
cd backend && npm run dev

# Install & use CLI
cd cli && npm install && npm run build && npm link
openanalyst config set-url http://localhost:3456
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000
openanalyst run "Hello Claude!"
```

### AWS EC2

```bash
# On EC2: Start with PM2
pm2 start dist/app.js --name openanalyst-api

# From anywhere: Use CLI
openanalyst config set-url http://YOUR_EC2_IP:3456
openanalyst auth login
openanalyst run "Hello from anywhere!"
```

---

## API Endpoints

### Health & Info

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/health` | GET | No | Health check with database status |
| `/` | GET | No | API info and endpoint list |

### Authentication

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/token` | POST | No | Generate JWT token |
| `/api/auth/verify` | POST | No | Verify JWT token |

### Agent (CLI Mode)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/agent/run` | POST | Yes | Run Claude Code (SSE streaming) |
| `/api/agent/run-sync` | POST | Yes | Run Claude Code (JSON response) |
| `/api/agent/continue` | POST | Yes | Continue conversation |

### Agent (SDK Mode)

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/agent/sdk/run` | POST | Yes | Run Agent SDK (SSE streaming) |
| `/api/agent/sdk/run-sync` | POST | Yes | Run Agent SDK (JSON response) |

### Conversations

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/agent/conversations` | GET | Yes | List user conversations |
| `/api/agent/conversations/:id/messages` | GET | Yes | Get conversation messages |

---

## Detailed Endpoint Reference

### POST `/api/auth/token`

Generate a JWT token for API access.

**Request Body:**
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",  // UUID format required
  "email": "user@example.com"                         // Optional
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "7d",
    "expiresAt": "2025-12-27T13:25:42.782Z",
    "userId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

---

### POST `/api/agent/run`

Run Claude Code with streaming output (Server-Sent Events).

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Create a hello world Express server",
  "projectId": "my-project",           // Optional, default: "default"
  "allowedTools": ["Read", "Edit", "Bash", "Glob"],  // Optional
  "model": "anthropic/claude-sonnet-4", // Optional
  "systemPrompt": "You are a senior developer", // Optional
  "maxTurns": 10                        // Optional
}
```

**Response (SSE Stream):**
```
data: {"type":"system","subtype":"init","session_id":"abc123"}

data: {"type":"assistant","content":"I'll create a simple Express server..."}

data: {"type":"tool_use","tool_name":"Edit","file":"server.js"}

data: {"type":"text","content":"Created server.js with Express setup"}

data: {"type":"done","exitCode":0,"sessionId":"abc123"}
```

---

### POST `/api/agent/run-sync`

Run Claude Code and get JSON response (blocking).

**Request Body:** Same as `/api/agent/run`

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "I've created the Express server in server.js...",
    "conversationId": "550e8400-e29b-41d4-a716-446655440001",
    "sessionId": "abc123"
  }
}
```

---

### POST `/api/agent/continue`

Continue an existing conversation.

**Request Body:**
```json
{
  "prompt": "Now add a /users endpoint",
  "projectId": "my-project",
  "conversationId": "550e8400-e29b-41d4-a716-446655440001"  // Optional
}
```

**Response:** SSE stream (same as `/api/agent/run`)

---

### POST `/api/agent/sdk/run`

Run using the Agent SDK (programmatic, no CLI subprocess).

**Request Body:** Same as `/api/agent/run`

**Response:** SSE stream

---

### POST `/api/agent/sdk/run-sync`

Run Agent SDK and get JSON response.

**Request Body:** Same as `/api/agent/run`

**Response:**
```json
{
  "success": true,
  "data": {
    "result": "Task completed...",
    "conversationId": "...",
    "sessionId": "...",
    "usage": {
      "tokensInput": 1500,
      "tokensOutput": 2000,
      "costUsd": 0.0525
    }
  }
}
```

---

### GET `/api/agent/conversations`

List all conversations for the authenticated user.

**Query Parameters:**
- `archived` (boolean): Include archived conversations
- `limit` (number): Max results (default: 50)
- `offset` (number): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "conversation_id": "...",
      "title": "Project: my-project",
      "message_count": 5,
      "total_tokens_used": 15000,
      "total_cost_usd": 0.45,
      "created_at": "2025-12-20T10:00:00Z",
      "updated_at": "2025-12-20T12:00:00Z"
    }
  ]
}
```

---

## Frontend Integration Examples

### JavaScript/TypeScript (Streaming)

```typescript
const token = 'your-jwt-token';

const response = await fetch('https://your-ec2-ip:3456/api/agent/run', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'Create a React component for user login',
    projectId: 'my-app',
  }),
});

// Read SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

  for (const line of lines) {
    const data = JSON.parse(line.replace('data: ', ''));
    console.log('Claude:', data);

    // Handle different message types
    switch (data.type) {
      case 'text':
        console.log('Response:', data.content);
        break;
      case 'tool_use':
        console.log('Using tool:', data.tool_name);
        break;
      case 'done':
        console.log('Completed with exit code:', data.exitCode);
        break;
      case 'error':
        console.error('Error:', data.content);
        break;
    }
  }
}
```

### JavaScript/TypeScript (JSON)

```typescript
const response = await fetch('https://your-ec2-ip:3456/api/agent/run-sync', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    prompt: 'List all TypeScript files',
    projectId: 'my-app',
  }),
});

const result = await response.json();
console.log(result.data.result);
```

### Python

```python
import requests

token = "your-jwt-token"
base_url = "https://your-ec2-ip:3456"

# JSON response
response = requests.post(
    f"{base_url}/api/agent/run-sync",
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    },
    json={
        "prompt": "Analyze this project structure",
        "projectId": "my-project"
    }
)

print(response.json())
```

### cURL Examples

```bash
# Get token
TOKEN=$(curl -s -X POST http://localhost:3456/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000"}' | jq -r '.data.token')

# Run sync
curl -X POST http://localhost:3456/api/agent/run-sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Create a simple Express server", "projectId": "demo"}'

# Run streaming
curl -N -X POST http://localhost:3456/api/agent/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "List files", "projectId": "demo"}'

# Continue conversation
curl -N -X POST http://localhost:3456/api/agent/continue \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Now add error handling", "projectId": "demo"}'
```

---

## Error Responses

All errors follow this format:

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

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `AGENT_ERROR` | 500 | Claude Code execution failed |
| `DATABASE_ERROR` | 500 | Database operation failed |

---

## Rate Limiting

- **Window:** 60 seconds
- **Max Requests:** 100 per window
- **Headers:** Standard rate limit headers included

---

## Claude Code CLI Options (Complete Reference)

All Claude Code CLI flags are supported via the API:

### Core Options

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `model` | `--model` | Model to use (sonnet, opus, haiku, or full name) |
| `fallbackModel` | `--fallback-model` | Fallback model when primary is overloaded |
| `allowedTools` | `--allowedTools` | Tools that execute without permission |
| `disallowedTools` | `--disallowedTools` | Tools removed from context |

### Prompt Customization

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `systemPrompt` | `--system-prompt` | Replace entire default system prompt |
| `appendSystemPrompt` | `--append-system-prompt` | Add to default prompt |

### Session Management

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `resume` | `--resume, -r` | Resume session by ID or name |
| `sessionId` | `--session-id` | Use specific session UUID |
| `forkSession` | `--fork-session` | Create new session when resuming |

### Execution Control

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `maxTurns` | `--max-turns` | Limit agentic turns |
| `addDirs` | `--add-dir` | Additional working directories |

### Output Options

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `outputFormat` | `--output-format` | text, json, stream-json |
| `verbose` | `--verbose` | Enable verbose logging |
| `jsonSchema` | `--json-schema` | Get validated JSON output |

### Agents/Subagents

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `agents` | `--agents` | Define custom subagents (JSON) |
| `agent` | `--agent` | Use specific agent |

### Permissions & Security

| Parameter | CLI Flag | Description |
|-----------|----------|-------------|
| `permissionMode` | `--permission-mode` | default, plan, bypassPermissions, acceptEdits |
| `dangerouslySkipPermissions` | `--dangerously-skip-permissions` | Skip all permission prompts |

---

## Built-in Tools

| Tool | Description |
|------|-------------|
| `Read` | Read any file in working directory |
| `Write` | Create new files |
| `Edit` | Make precise edits to existing files |
| `Bash` | Run terminal commands, scripts, git |
| `Glob` | Find files by pattern (`**/*.ts`) |
| `Grep` | Search file contents with regex |
| `WebSearch` | Search the web for current info |
| `WebFetch` | Fetch and parse web content |
| `Task` | Spawn subagents for subtasks |
| `TodoWrite` | Manage todo list |
| `NotebookEdit` | Edit Jupyter notebooks |

### Example: Restrict Tools

```json
{
  "prompt": "Analyze this file",
  "allowedTools": ["Read", "Glob", "Grep"]
}
```

### Example: Custom Subagents

```json
{
  "prompt": "Review this codebase",
  "agents": {
    "code-reviewer": {
      "description": "Expert code reviewer",
      "prompt": "Analyze code quality and security",
      "tools": ["Read", "Glob", "Grep"],
      "model": "sonnet"
    }
  },
  "allowedTools": ["Read", "Glob", "Grep", "Task"]
}
```

---

## Workspace Isolation

Each user's work is isolated:

```
/workspaces/
  ├── {user_id}/
  │   ├── project-1/
  │   │   ├── .claude/      ← Session data
  │   │   ├── src/
  │   │   └── package.json
  │   └── project-2/
  └── {other_user_id}/
```

- Projects are created automatically
- Files persist between requests
- Use `projectId` to switch contexts

---

## Models Available

Via OpenRouter:

| Model | ID | Best For |
|-------|-----|----------|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | General coding |
| Claude Opus 4.1 | `anthropic/claude-opus-4.1` | Complex reasoning |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4.5` | Fast, simple tasks |

Specify in request:
```json
{
  "prompt": "Complex architecture review",
  "model": "anthropic/claude-opus-4.1"
}
```

---

## OpenAnalyst CLI

A command-line tool for interacting with the OpenAnalyst API.

### Installation

```bash
cd cli
npm install
npm run build
npm link  # Makes 'openanalyst' and 'oa' available globally
```

Or install globally:
```bash
npm install -g openanalyst
```

### Quick Start (Localhost)

```bash
# 1. Set API URL to localhost
openanalyst config set-url http://localhost:3456

# 2. Login with a user ID (UUID format)
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000 -e myemail@example.com

# 3. Check connection
openanalyst health

# 4. Run a prompt
openanalyst run "Create a hello world Express server"

# 5. Continue conversation
openanalyst continue "Now add error handling"
```

### Quick Start (AWS EC2 / Remote)

```bash
# 1. Set API URL to your EC2 public IP
openanalyst config set-url http://YOUR_EC2_PUBLIC_IP:3456

# 2. Login
openanalyst auth login

# 3. Run prompts
openanalyst run "Analyze this codebase"
```

### Commands Reference

#### Configuration

```bash
# Set API URL
openanalyst config set-url https://api.example.com

# Show current config
openanalyst config show

# Set default project
openanalyst config set-project my-project

# Clear all config
openanalyst config clear
```

#### Authentication

```bash
# Login (interactive)
openanalyst auth login

# Login with flags
openanalyst auth login -u 550e8400-e29b-41d4-a716-446655440000 -e user@example.com

# Check auth status
openanalyst auth status

# Logout
openanalyst auth logout
```

#### Running Prompts

```bash
# Basic run (streaming)
openanalyst run "List all TypeScript files"

# Run with project
openanalyst run "Create API endpoint" -p my-api

# Run with specific model
openanalyst run "Complex task" -m anthropic/claude-opus-4.1

# Run sync (wait for complete response)
openanalyst run "Quick question" -s

# Use SDK mode
openanalyst run "Task" --sdk

# Limit tools
openanalyst run "Read files" -t "Read,Glob,Grep"
```

#### Continuing Conversations

```bash
# Continue last conversation
openanalyst continue "Now add tests"

# Continue in specific project
openanalyst continue "Add validation" -p my-api
```

#### Other Commands

```bash
# List conversations
openanalyst conversations
openanalyst conversations -l 20

# Check API health
openanalyst health

# Interactive mode
openanalyst interactive
openanalyst i -p my-project
```

### Interactive Mode

Start an interactive session:

```bash
$ openanalyst i

OpenAnalyst Interactive Mode
Type your prompts. Use /exit to quit, /continue for follow-up.

> Create a REST API with Express
[Claude responds...]

> /continue
continue> Now add authentication
[Claude continues...]

> /project new-project
Switched to project: new-project

> /exit
Goodbye!
```

### Aliases

- `openanalyst` or `oa` - Main command
- `openanalyst i` - Interactive mode

### Environment Variables

The CLI stores configuration in `~/.config/openanalyst/config.json`:

```json
{
  "apiUrl": "https://api.example.com",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "project": "default"
}
```
