# Phase 2: Windmill Integration

## Objective
Configure Windmill and create base scripts/flows that Agno will orchestrate.

## Windmill Concepts
- **Scripts**: Single units of code (Python, TypeScript, Go, Bash, SQL)
- **Flows**: DAG of scripts executed in sequence/parallel
- **Apps**: UI built on top of scripts/flows
- **Resources**: Credentials and connections
- **Schedules**: Cron-based triggers

## Tasks

### 2.1 Windmill Workspace Setup
```bash
# Access Windmill at http://localhost:8000
# Default credentials: admin@windmill.dev / changeme

# Create workspace via UI or API
curl -X POST http://localhost:8000/api/workspaces/create \
  -H "Authorization: Bearer $WINDMILL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id": "openanalyst", "name": "OpenAnalyst"}'
```

### 2.2 Create Base Resource Types
Define resources for:
- Database connections
- API keys (mock for local)
- WebSocket endpoint

**Resource Type Definition**:
```json
{
  "name": "openanalyst_config",
  "schema": {
    "type": "object",
    "properties": {
      "ws_endpoint": { "type": "string" },
      "user_id": { "type": "string" },
      "session_id": { "type": "string" }
    }
  }
}
```

### 2.3 Core Scripts Library
Create these foundational scripts in Windmill:

**Location**: `services/windmill/scripts/`

```
scripts/
├── core/
│   ├── send_ws_message.ts      # Send message via WebSocket
│   ├── log_activity.ts         # Log user activity
│   └── error_handler.ts        # Standard error handling
├── social/
│   ├── create_post.ts          # Create social media post
│   ├── schedule_post.ts        # Schedule posting
│   └── analyze_engagement.ts   # Analyze post performance
├── analytics/
│   ├── fetch_metrics.ts        # Fetch platform metrics
│   ├── generate_report.ts      # Generate analytics report
│   └── aggregate_data.ts       # Aggregate multi-source data
└── workflows/
    ├── onboard_user.ts         # User onboarding flow
    └── daily_report.ts         # Daily analytics report
```

**Example Script - send_ws_message.ts**:
```typescript
// Windmill TypeScript script
import * as wmill from "windmill-client";

export async function main(
  message_type: string,
  payload: object,
  user_id: string,
  session_id: string
) {
  const ws_endpoint = await wmill.getVariable("f/openanalyst/ws_endpoint");
  
  // Send via HTTP to WebSocket Hub (which broadcasts to WS clients)
  const response = await fetch(`${ws_endpoint}/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: message_type,
      userId: user_id,
      sessionId: session_id,
      payload,
      timestamp: Date.now()
    })
  });
  
  return { success: response.ok };
}
```

### 2.4 Core Flows
Create workflow DAGs for common operations:

**Flow: User Task Execution**
```yaml
# f/openanalyst/execute_user_task
summary: Execute a user-requested task
value:
  modules:
    - id: a
      value:
        type: script
        path: f/openanalyst/core/log_activity
        input_transforms:
          action:
            type: static
            value: "task_started"
    - id: b
      value:
        type: script
        path: f/openanalyst/core/send_ws_message
        input_transforms:
          message_type:
            type: static
            value: "TASK_PROGRESS"
          payload:
            type: javascript
            expr: "{ status: 'processing', taskId: flow_input.task_id }"
```

### 2.5 Agno-Windmill Integration
Update Agno to call Windmill scripts:

**File**: `services/agno/src/tools/windmill.py`
```python
import httpx
from typing import Any

class WindmillClient:
    def __init__(self, base_url: str, token: str):
        self.base_url = base_url
        self.token = token
        self.client = httpx.AsyncClient()
    
    async def run_script(self, path: str, args: dict[str, Any]) -> dict:
        """Run a Windmill script and return result"""
        response = await self.client.post(
            f"{self.base_url}/api/w/openanalyst/jobs/run/p/{path}",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"args": args}
        )
        return response.json()
    
    async def run_flow(self, path: str, args: dict[str, Any]) -> dict:
        """Run a Windmill flow and return result"""
        response = await self.client.post(
            f"{self.base_url}/api/w/openanalyst/jobs/run/f/{path}",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"args": args}
        )
        return response.json()
    
    async def get_job_result(self, job_id: str) -> dict:
        """Get result of a completed job"""
        response = await self.client.get(
            f"{self.base_url}/api/w/openanalyst/jobs_u/completed/get_result/{job_id}",
            headers={"Authorization": f"Bearer {self.token}"}
        )
        return response.json()
```

### 2.6 Agno Tools Registration
Register Windmill as tools for Agno agent:

```python
from agno.tools import tool

@tool
async def create_windmill_script(
    name: str,
    language: str,
    code: str,
    description: str
) -> dict:
    """Create a new script in Windmill"""
    # Implementation
    pass

@tool
async def execute_windmill_task(
    script_path: str,
    arguments: dict
) -> dict:
    """Execute an existing Windmill script"""
    client = WindmillClient(
        base_url=os.getenv("WINDMILL_URL"),
        token=os.getenv("WINDMILL_TOKEN")
    )
    return await client.run_script(script_path, arguments)

@tool
async def create_windmill_flow(
    name: str,
    steps: list[dict],
    description: str
) -> dict:
    """Create a new workflow in Windmill"""
    # Implementation
    pass
```

## Testing

### Manual Test Flow
1. Start all services
2. Send request to Brain: "Create a simple hello world script"
3. Verify Agno receives and routes to Windmill
4. Verify script created in Windmill
5. Verify result returned via WebSocket

### Automated Tests
```bash
# Run Windmill integration tests
cd services/agno && pytest tests/test_windmill.py -v
```

## Checkpoint
Before proceeding to Phase 3:
- [ ] Windmill workspace configured
- [ ] Base scripts deployed
- [ ] Agno can call Windmill scripts
- [ ] Results flow back via WebSocket
- [ ] Error handling working

## Files Summary
- Windmill scripts: ~10 files
- Agno tools: ~3 files
- Flow definitions: ~3 files

## Next Phase
Proceed to [Phase 3: Skill System](./PHASE-3-skills.md)
