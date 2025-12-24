from typing import Dict, Any, Optional
import asyncio
import structlog

from app.agents.base_agent import BaseAgent
from app.models import (
    AgentType,
    AgentMessage,
    ExecutionPlan,
    ExecutionStep,
    TaskStatus,
    TaskResponse
)
from app.clients.windmill_client import windmill_client

logger = structlog.get_logger()


class ExecutorAgent(BaseAgent):
    """
    Executor Agent - Executes plans via Windmill.

    Responsibilities:
    - Execute Windmill scripts as defined in plans
    - Handle step dependencies
    - Aggregate results
    - Report progress and errors
    """

    def __init__(self):
        super().__init__(AgentType.EXECUTOR)

    async def process(self, message: AgentMessage) -> AgentMessage:
        """Execute the plan from the message context."""
        plan_data = message.context.get("plan")
        if not plan_data:
            return self.create_message(
                to_agent=AgentType.COORDINATOR,
                content="Error: No execution plan provided",
                context={"error": "Missing plan"}
            )

        plan = ExecutionPlan(**plan_data)

        await self.log_activity("executing_plan", {
            "task_id": plan.task_id,
            "steps": len(plan.steps)
        })

        # Execute the plan
        result = await self._execute_plan(plan)

        return self.create_message(
            to_agent=AgentType.COORDINATOR,
            content=f"Plan execution {'completed' if result.status == TaskStatus.COMPLETED else 'failed'}",
            context={"result": result.model_dump()}
        )

    async def _execute_plan(self, plan: ExecutionPlan) -> TaskResponse:
        """Execute all steps in the plan."""
        import time
        start_time = time.time()

        completed_steps = 0
        step_results: Dict[int, Any] = {}
        final_result = None
        error = None

        plan.status = TaskStatus.EXECUTING

        for step in plan.steps:
            # Check dependencies
            if not await self._check_dependencies(step, step_results):
                error = f"Step {step.step_number} dependencies not met"
                break

            # Execute step
            step.status = TaskStatus.EXECUTING

            await self.log_activity("executing_step", {
                "step": step.step_number,
                "description": step.description
            })

            try:
                result = await self._execute_step(step, step_results)
                step.status = TaskStatus.COMPLETED
                step.result = result
                step_results[step.step_number] = result
                completed_steps += 1
                final_result = result

            except Exception as e:
                step.status = TaskStatus.FAILED
                step.error = str(e)
                error = f"Step {step.step_number} failed: {str(e)}"
                logger.error("Step execution failed", step=step.step_number, error=str(e))
                break

        execution_time = int((time.time() - start_time) * 1000)

        return TaskResponse(
            task_id=plan.task_id,
            status=TaskStatus.COMPLETED if not error else TaskStatus.FAILED,
            result=final_result,
            error=error,
            execution_time_ms=execution_time,
            steps_completed=completed_steps,
            total_steps=len(plan.steps)
        )

    async def _check_dependencies(
        self,
        step: ExecutionStep,
        completed_results: Dict[int, Any]
    ) -> bool:
        """Check if all dependencies for a step are satisfied."""
        for dep in step.depends_on:
            if dep not in completed_results:
                return False
        return True

    async def _execute_step(
        self,
        step: ExecutionStep,
        previous_results: Dict[int, Any]
    ) -> Any:
        """Execute a single step."""
        # Inject results from previous steps into input params
        input_params = step.input_params.copy()
        for dep in step.depends_on:
            if dep in previous_results:
                input_params[f"step_{dep}_result"] = previous_results[dep]

        if step.script_path:
            # Execute via Windmill
            result = await windmill_client.run_script(
                script_path=step.script_path,
                args=input_params,
                wait=True
            )

            if result.status == "completed":
                return result.result
            else:
                raise Exception(result.error or "Script execution failed")
        else:
            # No script - return input params as result (passthrough)
            return input_params

    async def execute_single_script(
        self,
        script_path: str,
        args: Dict[str, Any],
        user_id: str
    ) -> TaskResponse:
        """Execute a single Windmill script directly."""
        import time
        start_time = time.time()

        try:
            result = await windmill_client.run_script(
                script_path=script_path,
                args=args,
                wait=True
            )

            execution_time = int((time.time() - start_time) * 1000)

            if result.status == "completed":
                return TaskResponse(
                    task_id=result.job_id,
                    status=TaskStatus.COMPLETED,
                    result=result.result,
                    execution_time_ms=execution_time,
                    steps_completed=1,
                    total_steps=1
                )
            else:
                return TaskResponse(
                    task_id=result.job_id,
                    status=TaskStatus.FAILED,
                    error=result.error,
                    execution_time_ms=execution_time,
                    steps_completed=0,
                    total_steps=1
                )

        except Exception as e:
            return TaskResponse(
                task_id="",
                status=TaskStatus.FAILED,
                error=str(e),
                execution_time_ms=int((time.time() - start_time) * 1000),
                steps_completed=0,
                total_steps=1
            )


# Singleton instance
executor_agent = ExecutorAgent()
