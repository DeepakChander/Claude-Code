from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog

from app.config import get_settings
from app.models import TaskRequest, TaskResponse, TaskStatus, AgentMessage, AgentType
from app.agents import coordinator_agent, planner_agent, executor_agent
from app.clients.windmill_client import windmill_client

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    logger.info("Agno Orchestrator starting up")

    # Check Windmill connectivity
    windmill_healthy = await windmill_client.health_check()
    if windmill_healthy:
        logger.info("Windmill connection established")
    else:
        logger.warning("Windmill not accessible - some features may be limited")

    yield

    # Shutdown
    logger.info("Agno Orchestrator shutting down")


app = FastAPI(
    title="OpenAnalyst Agno Orchestrator",
    description="Multi-agent orchestration service for OpenAnalyst",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    settings = get_settings()
    windmill_ok = await windmill_client.health_check()

    return {
        "status": "healthy",
        "service": "agno-orchestrator",
        "version": "1.0.0",
        "components": {
            "windmill": "connected" if windmill_ok else "disconnected",
            "agents": {
                "coordinator": "active",
                "planner": "active",
                "executor": "active"
            }
        }
    }


@app.post("/api/tasks", response_model=TaskResponse)
async def create_task(request: TaskRequest):
    """
    Create and execute a new task.

    The task flows through:
    1. Coordinator - analyzes and routes
    2. Planner - creates execution plan
    3. Executor - executes via Windmill
    """
    logger.info("Task received", user_id=request.user_id, content_preview=request.content[:100])

    try:
        # Step 1: Coordinator analyzes the request
        coord_result = await coordinator_agent.handle_task_request(request)

        # Step 2: Create message for planner
        planner_message = AgentMessage(
            from_agent=AgentType.COORDINATOR,
            to_agent=AgentType.PLANNER,
            content=request.content,
            context={
                "user_id": request.user_id,
                "session_id": request.session_id,
                "detected_skill": coord_result["skill"],
                "conversation_id": request.conversation_id,
                **request.context
            }
        )

        # Step 3: Planner creates execution plan
        executor_message = await planner_agent.process(planner_message)

        # Step 4: Executor runs the plan
        result_message = await executor_agent.process(executor_message)

        # Extract result from message context
        result = result_message.context.get("result", {})

        return TaskResponse(
            task_id=result.get("task_id", coord_result["task_id"]),
            status=TaskStatus(result.get("status", "completed")),
            result=result.get("result"),
            error=result.get("error"),
            execution_time_ms=result.get("execution_time_ms", 0),
            steps_completed=result.get("steps_completed", 0),
            total_steps=result.get("total_steps", 0)
        )

    except Exception as e:
        logger.error("Task execution failed", error=str(e), user_id=request.user_id)
        return TaskResponse(
            task_id="",
            status=TaskStatus.FAILED,
            error=str(e)
        )


@app.post("/api/scripts/run", response_model=TaskResponse)
async def run_script(script_path: str, args: dict, user_id: str):
    """Run a specific Windmill script directly."""
    logger.info("Direct script execution", script=script_path, user_id=user_id)

    result = await executor_agent.execute_single_script(
        script_path=script_path,
        args=args,
        user_id=user_id
    )

    return result


@app.post("/api/users/{user_id}/workspace")
async def create_user_workspace(user_id: str):
    """Create a Windmill workspace for a new user."""
    logger.info("Creating user workspace", user_id=user_id)

    success = await windmill_client.create_user_folder(user_id)

    if success:
        return {"status": "success", "message": f"Workspace created for user {user_id}"}
    else:
        raise HTTPException(status_code=500, detail="Failed to create workspace")


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "service": "OpenAnalyst Agno Orchestrator",
        "version": "1.0.0",
        "endpoints": {
            "health": "GET /health",
            "create_task": "POST /api/tasks",
            "run_script": "POST /api/scripts/run",
            "create_workspace": "POST /api/users/{user_id}/workspace"
        }
    }


if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug
    )
