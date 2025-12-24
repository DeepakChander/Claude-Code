# Phase 1: Core Services Implementation

## Objective
Implement the three core services: Brain (Claude CLI wrapper), Agno Orchestrator, and WebSocket Hub.

## Architecture Overview
```
User Request → Brain (Claude CLI) → Agno (Orchestrator) → Windmill (Executor)
                    ↑                      ↓
                    └──── WebSocket Hub ←──┘
```

## Tasks

### 1.1 WebSocket Hub Service
**Location**: `services/websocket-hub/`

Create a WebSocket server that:
- Manages connections per user/session
- Routes messages between services
- Handles authentication via JWT
- Maintains connection heartbeats

**Files to create**:
```
services/websocket-hub/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # WebSocket server
│   ├── handlers/
│   │   ├── connection.ts     # Connection management
│   │   ├── message.ts        # Message routing
│   │   └── heartbeat.ts      # Keep-alive logic
│   ├── middleware/
│   │   └── auth.ts           # JWT validation
│   └── types/
│       └── messages.ts       # Message type definitions
└── Dockerfile
```

**Key Implementation**:
```typescript
// Message types (see /docs/specs/websocket-protocol.md)
interface WSMessage {
  type: 'BRAIN_REQUEST' | 'AGNO_DECISION' | 'WINDMILL_TASK' | 'RESULT';
  userId: string;
  sessionId: string;
  payload: unknown;
  timestamp: number;
}
```

### 1.2 Brain Service (Claude CLI Wrapper)
**Location**: `services/brain/`

Create a service that:
- Wraps Claude CLI functionality
- Routes requests to Agno for orchestration decisions
- Maintains conversation context per user
- Implements skill system (see Task 2 architecture)

**Files to create**:
```
services/brain/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Entry point
│   ├── claude-client.ts      # Claude API client
│   ├── context/
│   │   ├── manager.ts        # Context management
│   │   └── memory.ts         # User memory/KB
│   ├── skills/
│   │   ├── loader.ts         # Skill loader
│   │   └── registry.ts       # Skill registry
│   ├── handlers/
│   │   └── request.ts        # Request processing
│   └── types/
│       └── index.ts
├── skills/                   # Skill definitions (SKILL.md files)
│   └── CORE/
│       └── SKILL.md
└── Dockerfile
```

**Skill Structure** (following PAI pattern):
```markdown
# skills/CORE/SKILL.md
---
name: Core
description: Core orchestration capabilities
triggers: ["start", "help", "status"]
---

## Capabilities
- Route requests to appropriate services
- Manage user context
- Handle errors and retries
```

### 1.3 Agno Orchestrator Service
**Location**: `services/agno/`

Create a Python service using Agno framework that:
- Receives requests from Brain
- Makes orchestration decisions
- Sends tasks to Windmill
- Manages multi-agent coordination

**Files to create**:
```
services/agno/
├── requirements.txt
├── pyproject.toml
├── src/
│   ├── __init__.py
│   ├── main.py               # FastAPI entry
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── coordinator.py    # Main coordinator agent
│   │   ├── planner.py        # Task planning agent
│   │   └── executor.py       # Execution decision agent
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── windmill.py       # Windmill API tools
│   │   └── websocket.py      # WebSocket communication
│   ├── models/
│   │   └── decisions.py      # Decision models
│   └── config.py
└── Dockerfile
```

**Coordinator Agent Pattern**:
```python
from agno.agent import Agent
from agno.models.anthropic import Claude
from agno.tools.mcp import MCPTools

coordinator = Agent(
    name="OpenAnalyst Coordinator",
    model=Claude(id="claude-sonnet-4-5"),
    instructions="""
    You are the coordinator for OpenAnalyst.
    Your job is to:
    1. Analyze user requests
    2. Decide which Windmill workflow to trigger
    3. Monitor execution and handle errors
    4. Return results to the Brain service
    """,
    tools=[windmill_tools, websocket_tools],
)
```

## Integration Points

### Brain → Agno Communication
```typescript
// Brain sends to Agno via WebSocket
{
  type: 'BRAIN_REQUEST',
  payload: {
    intent: 'create_workflow',
    context: { ... },
    userRequest: 'Create a social media posting schedule'
  }
}
```

### Agno → Windmill Communication
```python
# Agno calls Windmill API
async def execute_windmill_task(task_type: str, params: dict):
    response = await windmill_client.run_script(
        path=f"f/openanalyst/{task_type}",
        args=params
    )
    return response
```

## Testing Checklist
- [ ] WebSocket Hub accepts connections
- [ ] Brain processes simple requests
- [ ] Agno makes routing decisions
- [ ] Services communicate via WebSocket

## Checkpoint
Before proceeding to Phase 2:
- [ ] All three services running
- [ ] WebSocket communication working
- [ ] Basic request flow: Brain → Agno → Response
- [ ] Logging implemented for debugging

## Files Summary
Total new files: ~25
Estimated time: 4-6 hours

## Next Phase
Proceed to [Phase 2: Windmill Integration](./PHASE-2-windmill.md)
