from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import structlog

from app.models import AgentType, AgentMessage

logger = structlog.get_logger()


class BaseAgent(ABC):
    """Base class for all agents in the orchestration system."""

    def __init__(self, agent_type: AgentType):
        self.agent_type = agent_type
        self.logger = logger.bind(agent=agent_type.value)

    @abstractmethod
    async def process(self, message: AgentMessage) -> AgentMessage:
        """Process an incoming message and return a response."""
        pass

    def create_message(
        self,
        to_agent: AgentType,
        content: str,
        context: Optional[Dict[str, Any]] = None
    ) -> AgentMessage:
        """Create a new agent message."""
        return AgentMessage(
            from_agent=self.agent_type,
            to_agent=to_agent,
            content=content,
            context=context or {}
        )

    async def log_activity(self, action: str, details: Optional[Dict[str, Any]] = None):
        """Log agent activity for debugging and monitoring."""
        self.logger.info(action, **details or {})
