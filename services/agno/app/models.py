from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class TaskStatus(str, Enum):
    PENDING = "pending"
    PLANNING = "planning"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"


class AgentType(str, Enum):
    COORDINATOR = "coordinator"
    PLANNER = "planner"
    EXECUTOR = "executor"
    RESEARCHER = "researcher"


class ExecutionStep(BaseModel):
    """A single step in an execution plan."""
    step_number: int
    description: str
    agent: AgentType
    script_path: Optional[str] = None
    input_params: Dict[str, Any] = Field(default_factory=dict)
    depends_on: List[int] = Field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None


class ExecutionPlan(BaseModel):
    """A complete execution plan created by the Planner agent."""
    task_id: str
    user_id: str
    original_request: str
    skill: Optional[str] = None
    steps: List[ExecutionStep] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    status: TaskStatus = TaskStatus.PENDING


class TaskRequest(BaseModel):
    """Incoming task request from Brain service."""
    user_id: str
    session_id: str
    content: str
    conversation_id: Optional[str] = None
    skill: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TaskResponse(BaseModel):
    """Response from task execution."""
    task_id: str
    status: TaskStatus
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time_ms: int = 0
    steps_completed: int = 0
    total_steps: int = 0


class WindmillJobRequest(BaseModel):
    """Request to execute a Windmill script."""
    script_path: str
    args: Dict[str, Any] = Field(default_factory=dict)
    user_id: str


class WindmillJobResult(BaseModel):
    """Result from Windmill job execution."""
    job_id: str
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: int = 0


class AgentMessage(BaseModel):
    """Message passed between agents."""
    from_agent: AgentType
    to_agent: AgentType
    content: str
    context: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
