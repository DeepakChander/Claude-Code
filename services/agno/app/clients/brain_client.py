import httpx
import asyncio
from typing import Dict, Any, Optional, AsyncGenerator
import structlog
import json

from app.config import get_settings

logger = structlog.get_logger()


class BrainClient:
    """
    Client for interacting with the Brain Service (Claude CLI wrapper).

    The Brain service at port 3456 hosts the Claude CLI via OpenRouter.
    This client allows Agno to delegate AI tasks to the Brain.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.brain_service_url
        self.timeout = 120.0  # 2 minute timeout for AI responses

    async def get_auth_token(self, api_key: str) -> Optional[str]:
        """Get JWT token from Brain service."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/auth/token",
                    json={"apiKey": api_key},
                    timeout=10.0
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("data", {}).get("token")
                return None
            except httpx.HTTPError as e:
                logger.error("Failed to get auth token", error=str(e))
                return None

    async def run_agent(
        self,
        prompt: str,
        user_id: str,
        session_id: str,
        conversation_id: Optional[str] = None,
        token: Optional[str] = None,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Execute a prompt via the Brain's Claude CLI.

        Args:
            prompt: The prompt to send to Claude
            user_id: User identifier
            session_id: Session identifier
            conversation_id: Optional conversation ID for context
            token: JWT token for authentication
            stream: Whether to use streaming response

        Returns:
            Response from the Brain service
        """
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        payload = {
            "prompt": prompt,
            "userId": user_id,
            "sessionId": session_id
        }

        if conversation_id:
            payload["conversationId"] = conversation_id

        endpoint = "/api/agent/run-sync" if not stream else "/api/agent/run"

        async with httpx.AsyncClient() as client:
            try:
                if stream:
                    return await self._run_streaming(client, endpoint, payload, headers)
                else:
                    response = await client.post(
                        f"{self.base_url}{endpoint}",
                        json=payload,
                        headers=headers,
                        timeout=self.timeout
                    )
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPError as e:
                logger.error("Brain API error", error=str(e), endpoint=endpoint)
                return {"success": False, "error": str(e)}

    async def _run_streaming(
        self,
        client: httpx.AsyncClient,
        endpoint: str,
        payload: Dict[str, Any],
        headers: Dict[str, str]
    ) -> Dict[str, Any]:
        """Handle streaming response from Brain service."""
        full_response = ""
        conversation_id = None

        async with client.stream(
            "POST",
            f"{self.base_url}{endpoint}",
            json=payload,
            headers=headers,
            timeout=self.timeout
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        if "content" in chunk:
                            full_response += chunk["content"]
                        if "conversationId" in chunk:
                            conversation_id = chunk["conversationId"]
                    except json.JSONDecodeError:
                        pass

        return {
            "success": True,
            "data": {
                "response": full_response,
                "conversationId": conversation_id
            }
        }

    async def run_agent_sdk(
        self,
        prompt: str,
        user_id: str,
        system_prompt: Optional[str] = None,
        tools: Optional[list] = None,
        token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute via the Agent SDK endpoint for more control.

        This endpoint provides access to Claude's tool use capabilities.
        """
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        payload = {
            "prompt": prompt,
            "userId": user_id
        }

        if system_prompt:
            payload["systemPrompt"] = system_prompt
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/agent/sdk/run-sync",
                    json=payload,
                    headers=headers,
                    timeout=self.timeout
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error("Brain SDK API error", error=str(e))
                return {"success": False, "error": str(e)}

    async def resume_conversation(
        self,
        conversation_id: str,
        prompt: str,
        token: Optional[str] = None
    ) -> Dict[str, Any]:
        """Resume an existing conversation with context."""
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    f"{self.base_url}/api/agent/resume/{conversation_id}",
                    json={"prompt": prompt},
                    headers=headers,
                    timeout=self.timeout
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error("Failed to resume conversation", error=str(e))
                return {"success": False, "error": str(e)}

    async def health_check(self) -> bool:
        """Check if Brain service is accessible."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/health",
                    timeout=5.0
                )
                return response.status_code == 200
            except httpx.HTTPError:
                return False

    async def get_resumable_conversations(
        self,
        user_id: str,
        token: Optional[str] = None
    ) -> list:
        """Get list of resumable conversations for a user."""
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/api/agent/resumable",
                    params={"userId": user_id},
                    headers=headers,
                    timeout=10.0
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("data", {}).get("conversations", [])
                return []
            except httpx.HTTPError:
                return []


# Singleton instance
brain_client = BrainClient()
