from typing import Dict, Any, Optional
import structlog

from app.agents.base_agent import BaseAgent
from app.models import (
    AgentType,
    AgentMessage,
    TaskRequest,
    ExecutionPlan,
    TaskStatus
)

logger = structlog.get_logger()


class CoordinatorAgent(BaseAgent):
    """
    Coordinator Agent - The entry point for all task requests.

    Responsibilities:
    - Receive requests from Brain service
    - Analyze intent and determine which skill to use
    - Delegate to Planner for execution planning
    - Monitor overall task progress
    """

    def __init__(self):
        super().__init__(AgentType.COORDINATOR)
        self.skill_keywords = {
            "social_media": ["post", "tweet", "linkedin", "instagram", "facebook", "social"],
            "analytics": ["analyze", "metrics", "report", "dashboard", "statistics", "data"],
            "workflow": ["automate", "schedule", "workflow", "flow", "pipeline"],
            "core": ["help", "general", "question", "explain"]
        }

    async def process(self, message: AgentMessage) -> AgentMessage:
        """Process incoming message and coordinate response."""
        await self.log_activity("received_message", {
            "from": message.from_agent.value,
            "content_preview": message.content[:100]
        })

        # Analyze the request
        skill = self._detect_skill(message.content)

        # Create context for planner
        context = {
            **message.context,
            "detected_skill": skill,
            "original_request": message.content
        }

        # Delegate to planner
        response = self.create_message(
            to_agent=AgentType.PLANNER,
            content=message.content,
            context=context
        )

        await self.log_activity("delegating_to_planner", {"skill": skill})

        return response

    def _detect_skill(self, content: str) -> str:
        """Detect which skill should handle this request."""
        content_lower = content.lower()

        for skill, keywords in self.skill_keywords.items():
            for keyword in keywords:
                if keyword in content_lower:
                    return skill

        return "core"  # Default skill

    async def handle_task_request(self, request: TaskRequest) -> Dict[str, Any]:
        """Handle incoming task request from Brain service."""
        await self.log_activity("task_request_received", {
            "user_id": request.user_id,
            "content_preview": request.content[:100] if request.content else ""
        })

        # Detect skill if not provided
        skill = request.skill or self._detect_skill(request.content)

        return {
            "task_id": f"task_{request.session_id}",
            "user_id": request.user_id,
            "skill": skill,
            "status": TaskStatus.PLANNING.value,
            "message": f"Task received, using {skill} skill"
        }


# Singleton instance
coordinator_agent = CoordinatorAgent()
