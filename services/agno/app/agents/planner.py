from typing import Dict, Any, List
from uuid import uuid4
import structlog

from app.agents.base_agent import BaseAgent
from app.models import (
    AgentType,
    AgentMessage,
    ExecutionPlan,
    ExecutionStep,
    TaskStatus
)

logger = structlog.get_logger()


class PlannerAgent(BaseAgent):
    """
    Planner Agent - Creates execution plans for tasks.

    Responsibilities:
    - Analyze task requirements
    - Break down complex tasks into steps
    - Identify required Windmill scripts
    - Create ordered execution plan
    """

    def __init__(self):
        super().__init__(AgentType.PLANNER)
        self.skill_scripts = {
            "social_media": {
                "create_post": "f/openanalyst/social/create_post",
                "schedule_post": "f/openanalyst/social/schedule_post",
                "analyze_engagement": "f/openanalyst/social/analyze_engagement"
            },
            "analytics": {
                "fetch_metrics": "f/openanalyst/analytics/fetch_metrics",
                "generate_report": "f/openanalyst/analytics/generate_report",
                "create_dashboard": "f/openanalyst/analytics/create_dashboard"
            },
            "workflow": {
                "create_flow": "f/openanalyst/workflow/create_flow",
                "schedule_flow": "f/openanalyst/workflow/schedule_flow"
            },
            "core": {
                "send_message": "f/openanalyst/core/send_ws_message",
                "log_activity": "f/openanalyst/core/log_activity"
            }
        }

    async def process(self, message: AgentMessage) -> AgentMessage:
        """Create an execution plan for the task."""
        await self.log_activity("creating_plan", {
            "skill": message.context.get("detected_skill"),
            "request": message.content[:100]
        })

        skill = message.context.get("detected_skill", "core")
        user_id = message.context.get("user_id", "unknown")

        # Create execution plan
        plan = await self._create_plan(
            content=message.content,
            skill=skill,
            user_id=user_id,
            context=message.context
        )

        # Create response for executor
        response = self.create_message(
            to_agent=AgentType.EXECUTOR,
            content=f"Execute plan with {len(plan.steps)} steps",
            context={
                **message.context,
                "plan": plan.model_dump()
            }
        )

        await self.log_activity("plan_created", {
            "task_id": plan.task_id,
            "steps": len(plan.steps)
        })

        return response

    async def _create_plan(
        self,
        content: str,
        skill: str,
        user_id: str,
        context: Dict[str, Any]
    ) -> ExecutionPlan:
        """Create an execution plan based on the request."""
        task_id = str(uuid4())
        steps: List[ExecutionStep] = []

        # Get available scripts for this skill
        scripts = self.skill_scripts.get(skill, self.skill_scripts["core"])

        if skill == "social_media":
            # Social media workflow
            if any(word in content.lower() for word in ["create", "post", "tweet", "write"]):
                steps.append(ExecutionStep(
                    step_number=1,
                    description="Generate social media content",
                    agent=AgentType.EXECUTOR,
                    script_path=scripts.get("create_post"),
                    input_params={
                        "content_request": content,
                        "user_id": user_id
                    }
                ))

            if any(word in content.lower() for word in ["schedule", "later", "tomorrow"]):
                steps.append(ExecutionStep(
                    step_number=len(steps) + 1,
                    description="Schedule the post",
                    agent=AgentType.EXECUTOR,
                    script_path=scripts.get("schedule_post"),
                    input_params={"user_id": user_id},
                    depends_on=[1] if steps else []
                ))

        elif skill == "analytics":
            # Analytics workflow
            steps.append(ExecutionStep(
                step_number=1,
                description="Fetch metrics data",
                agent=AgentType.EXECUTOR,
                script_path=scripts.get("fetch_metrics"),
                input_params={
                    "query": content,
                    "user_id": user_id
                }
            ))

            if "report" in content.lower():
                steps.append(ExecutionStep(
                    step_number=2,
                    description="Generate report",
                    agent=AgentType.EXECUTOR,
                    script_path=scripts.get("generate_report"),
                    input_params={"user_id": user_id},
                    depends_on=[1]
                ))

        else:
            # Default: just log the activity
            steps.append(ExecutionStep(
                step_number=1,
                description="Process request",
                agent=AgentType.EXECUTOR,
                script_path=scripts.get("log_activity"),
                input_params={
                    "action": "task_processed",
                    "content": content,
                    "user_id": user_id
                }
            ))

        return ExecutionPlan(
            task_id=task_id,
            user_id=user_id,
            original_request=content,
            skill=skill,
            steps=steps
        )


# Singleton instance
planner_agent = PlannerAgent()
