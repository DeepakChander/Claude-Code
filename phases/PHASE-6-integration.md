# Phase 6: Integration & End-to-End Testing

## Objective
Connect all services, implement end-to-end flows, and verify the complete system works.

## Full System Flow
```
User (Frontend) 
  → WebSocket → Brain (Claude CLI wrapper)
    → Agno (Orchestrator)
      → Decision: Which Windmill task?
        → Windmill (Execute script/flow)
          → Result
        ← Eval Loop (verify output)
      ← Response
    ← Format response
  ← WebSocket → Update UI
```

## Tasks

### 6.1 Service Health Check Script
**File**: `scripts/health-check.sh`

```bash
#!/bin/bash

echo "🔍 Checking OpenAnalyst Services..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

check_service() {
    local name=$1
    local url=$2
    local expected=$3
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null)
    
    if [ "$response" == "$expected" ]; then
        echo -e "${GREEN}✓${NC} $name is healthy"
        return 0
    else
        echo -e "${RED}✗${NC} $name is not responding (got $response, expected $expected)"
        return 1
    fi
}

# Check each service
check_service "PostgreSQL" "http://localhost:5432" "000" || true  # TCP, not HTTP
check_service "Windmill" "http://localhost:8000/api/version" "200"
check_service "Brain Service" "http://localhost:8080/health" "200"
check_service "Agno Service" "http://localhost:8001/health" "200"
check_service "WebSocket Hub" "http://localhost:8002/health" "200"
check_service "Frontend" "http://localhost:3000" "200"

# Check WebSocket connectivity
echo ""
echo "🔌 Testing WebSocket..."
wscat -c ws://localhost:8002 -x '{"type":"ping"}' --wait 2 2>/dev/null && \
    echo -e "${GREEN}✓${NC} WebSocket responding" || \
    echo -e "${RED}✗${NC} WebSocket not responding"

echo ""
echo "✅ Health check complete"
```

### 6.2 Integration Test Suite
**File**: `services/integration-tests/test_full_flow.py`

```python
import pytest
import asyncio
import httpx
import websockets
import json
from typing import AsyncGenerator

BASE_URL = "http://localhost"
WS_URL = "ws://localhost:8002"

@pytest.fixture
async def http_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    async with httpx.AsyncClient() as client:
        yield client

@pytest.fixture
async def ws_client() -> AsyncGenerator[websockets.WebSocketClientProtocol, None]:
    async with websockets.connect(WS_URL) as ws:
        yield ws

class TestFullFlow:
    """End-to-end integration tests"""

    @pytest.mark.asyncio
    async def test_simple_request_flow(self, ws_client):
        """Test a simple request through the entire system"""
        # Send a request
        request = {
            "type": "USER_REQUEST",
            "userId": "test-user",
            "sessionId": "test-session",
            "payload": {
                "content": "What can you help me with?"
            }
        }
        await ws_client.send(json.dumps(request))
        
        # Wait for response
        response = await asyncio.wait_for(ws_client.recv(), timeout=30)
        data = json.loads(response)
        
        assert data["type"] == "ASSISTANT_RESPONSE"
        assert "content" in data["payload"]
        assert len(data["payload"]["content"]) > 0

    @pytest.mark.asyncio
    async def test_workflow_creation_flow(self, ws_client):
        """Test creating a workflow through natural language"""
        request = {
            "type": "USER_REQUEST",
            "userId": "test-user",
            "sessionId": "test-session",
            "payload": {
                "content": "Create a simple script that prints hello world"
            }
        }
        await ws_client.send(json.dumps(request))
        
        # Collect all responses until done
        responses = []
        while True:
            try:
                response = await asyncio.wait_for(ws_client.recv(), timeout=60)
                data = json.loads(response)
                responses.append(data)
                
                if data.get("payload", {}).get("done"):
                    break
            except asyncio.TimeoutError:
                break
        
        # Verify workflow was created
        assert len(responses) > 0
        final_response = responses[-1]
        assert "script" in final_response["payload"]["content"].lower() or \
               "created" in final_response["payload"]["content"].lower()

    @pytest.mark.asyncio
    async def test_eval_retry_mechanism(self, http_client):
        """Test that eval loop retries on failure"""
        # Create a task that will fail
        response = await http_client.post(
            f"{BASE_URL}:8080/eval/test",
            json={
                "task_id": "test-retry",
                "expected_output": {"impossible": True},
                "max_retries": 3
            }
        )
        data = response.json()
        
        assert data["retryCount"] == 3
        assert data["success"] == False

    @pytest.mark.asyncio
    async def test_windmill_script_execution(self, http_client):
        """Test direct Windmill script execution"""
        # First, create a test script in Windmill
        create_response = await http_client.post(
            f"{BASE_URL}:8000/api/w/openanalyst/scripts/create",
            headers={"Authorization": f"Bearer {WINDMILL_TOKEN}"},
            json={
                "path": "f/openanalyst/test/hello",
                "content": "export async function main() { return 'Hello, World!'; }",
                "language": "deno"
            }
        )
        assert create_response.status_code in [200, 201]
        
        # Execute the script
        run_response = await http_client.post(
            f"{BASE_URL}:8000/api/w/openanalyst/jobs/run/p/f/openanalyst/test/hello",
            headers={"Authorization": f"Bearer {WINDMILL_TOKEN}"},
            json={"args": {}}
        )
        assert run_response.status_code == 200
        
        job_id = run_response.json()
        
        # Wait for completion
        await asyncio.sleep(2)
        
        result_response = await http_client.get(
            f"{BASE_URL}:8000/api/w/openanalyst/jobs_u/completed/get_result/{job_id}",
            headers={"Authorization": f"Bearer {WINDMILL_TOKEN}"}
        )
        assert result_response.json() == "Hello, World!"

    @pytest.mark.asyncio
    async def test_agno_routing_decision(self, http_client):
        """Test Agno makes correct routing decisions"""
        response = await http_client.post(
            f"{BASE_URL}:8001/decide",
            json={
                "user_request": "Create a social media post about AI",
                "context": {}
            }
        )
        data = response.json()
        
        assert "skill" in data
        assert data["skill"] == "SOCIAL_MEDIA" or "social" in data["skill"].lower()
```

### 6.3 Load Testing
**File**: `services/integration-tests/load_test.py`

```python
import asyncio
import aiohttp
import time
from dataclasses import dataclass
from typing import List

@dataclass
class LoadTestResult:
    total_requests: int
    successful: int
    failed: int
    avg_response_time: float
    max_response_time: float
    min_response_time: float

async def make_request(session: aiohttp.ClientSession, url: str) -> tuple[bool, float]:
    start = time.time()
    try:
        async with session.post(url, json={"content": "test"}) as response:
            await response.json()
            return response.status == 200, time.time() - start
    except Exception:
        return False, time.time() - start

async def load_test(
    url: str,
    num_requests: int = 100,
    concurrency: int = 10
) -> LoadTestResult:
    """Run load test against the service"""
    response_times: List[float] = []
    successful = 0
    failed = 0
    
    async with aiohttp.ClientSession() as session:
        semaphore = asyncio.Semaphore(concurrency)
        
        async def bounded_request():
            nonlocal successful, failed
            async with semaphore:
                success, duration = await make_request(session, url)
                response_times.append(duration)
                if success:
                    successful += 1
                else:
                    failed += 1
        
        tasks = [bounded_request() for _ in range(num_requests)]
        await asyncio.gather(*tasks)
    
    return LoadTestResult(
        total_requests=num_requests,
        successful=successful,
        failed=failed,
        avg_response_time=sum(response_times) / len(response_times),
        max_response_time=max(response_times),
        min_response_time=min(response_times)
    )

if __name__ == "__main__":
    result = asyncio.run(load_test(
        url="http://localhost:8080/process",
        num_requests=100,
        concurrency=10
    ))
    
    print(f"""
    Load Test Results
    =================
    Total Requests: {result.total_requests}
    Successful: {result.successful}
    Failed: {result.failed}
    Avg Response Time: {result.avg_response_time:.3f}s
    Max Response Time: {result.max_response_time:.3f}s
    Min Response Time: {result.min_response_time:.3f}s
    """)
```

### 6.4 Docker Compose for Full Stack
**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: openanalyst
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  windmill:
    image: ghcr.io/windmill-labs/windmill:latest
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgres://postgres:postgres@postgres:5432/openanalyst
      MODE: standalone
    depends_on:
      postgres:
        condition: service_healthy

  websocket-hub:
    build: ./services/websocket-hub
    ports:
      - "8002:8002"
    environment:
      JWT_SECRET: ${JWT_SECRET:-dev-secret}
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis

  brain:
    build: ./services/brain
    ports:
      - "8080:8080"
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      WEBSOCKET_URL: ws://websocket-hub:8002
      AGNO_URL: http://agno:8001
      WINDMILL_URL: http://windmill:8000
    depends_on:
      - websocket-hub
      - windmill

  agno:
    build: ./services/agno
    ports:
      - "8001:8001"
    environment:
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      WINDMILL_URL: http://windmill:8000
      WINDMILL_TOKEN: ${WINDMILL_TOKEN}
    depends_on:
      - windmill

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_WS_URL: ws://localhost:8002
      NEXT_PUBLIC_API_URL: http://localhost:8080
    depends_on:
      - brain
      - websocket-hub

volumes:
  postgres_data:
```

### 6.5 Startup Script
**File**: `scripts/start-all.sh`

```bash
#!/bin/bash

echo "🚀 Starting OpenAnalyst..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env with your API keys and run again."
    exit 1
fi

# Load environment
source .env

# Start services
echo "📦 Starting Docker services..."
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
sleep 10

# Run health check
./scripts/health-check.sh

echo ""
echo "✅ OpenAnalyst is running!"
echo ""
echo "📍 Access points:"
echo "   Frontend: http://localhost:3000"
echo "   Windmill: http://localhost:8000"
echo "   Brain API: http://localhost:8080"
echo "   Agno API: http://localhost:8001"
echo "   WebSocket: ws://localhost:8002"
echo ""
echo "📝 Logs: docker-compose logs -f"
echo "🛑 Stop: docker-compose down"
```

## Manual Testing Checklist

### Basic Flow
- [ ] Open frontend at http://localhost:3000
- [ ] Send message: "Hello, what can you do?"
- [ ] Verify response appears
- [ ] Check WebSocket connection in browser DevTools

### Workflow Creation
- [ ] Send: "Create a script that fetches weather data"
- [ ] Verify Windmill script created
- [ ] Check script in Windmill UI at http://localhost:8000

### Skill Routing
- [ ] Send: "Create a Twitter post about AI"
- [ ] Verify routes to SOCIAL_MEDIA skill
- [ ] Send: "Generate an analytics report"
- [ ] Verify routes to ANALYTICS skill

### Error Handling
- [ ] Send invalid request
- [ ] Verify error message displayed
- [ ] Check logs for error details

### Eval Loop
- [ ] Create task that will fail initially
- [ ] Verify retries happen (check logs)
- [ ] Verify research protocol triggers after 3 failures

## Checkpoint
Before proceeding to Phase 7:
- [ ] All services start successfully
- [ ] Health check passes
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] No critical errors in logs

## Next Phase
Proceed to [Phase 7: Production Prep](./PHASE-7-production.md)
