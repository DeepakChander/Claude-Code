import httpx
import asyncio
from typing import Dict, Any, Optional
import structlog

from app.config import get_settings
from app.models import WindmillJobResult

logger = structlog.get_logger()


class WindmillClient:
    """Client for interacting with Windmill API."""

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.windmill_url
        self.token = settings.windmill_token
        self.workspace = settings.windmill_workspace
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }

    async def run_script(
        self,
        script_path: str,
        args: Dict[str, Any],
        wait: bool = True,
        timeout: int = 300
    ) -> WindmillJobResult:
        """Execute a Windmill script and optionally wait for result."""
        url = f"{self.base_url}/api/w/{self.workspace}/jobs/run/p/{script_path}"

        async with httpx.AsyncClient() as client:
            try:
                # Start the job
                response = await client.post(
                    url,
                    headers=self.headers,
                    json=args,
                    timeout=30.0
                )
                response.raise_for_status()
                job_id = response.text.strip('"')

                logger.info("Windmill job started", job_id=job_id, script=script_path)

                if not wait:
                    return WindmillJobResult(
                        job_id=job_id,
                        status="running",
                        result=None
                    )

                # Poll for completion
                return await self._wait_for_job(client, job_id, timeout)

            except httpx.HTTPError as e:
                logger.error("Windmill API error", error=str(e), script=script_path)
                return WindmillJobResult(
                    job_id="",
                    status="failed",
                    error=str(e)
                )

    async def _wait_for_job(
        self,
        client: httpx.AsyncClient,
        job_id: str,
        timeout: int
    ) -> WindmillJobResult:
        """Poll Windmill until job completes or times out."""
        url = f"{self.base_url}/api/w/{self.workspace}/jobs/completed/get_result/{job_id}"
        start_time = asyncio.get_event_loop().time()

        while True:
            elapsed = asyncio.get_event_loop().time() - start_time
            if elapsed > timeout:
                return WindmillJobResult(
                    job_id=job_id,
                    status="timeout",
                    error=f"Job timed out after {timeout}s"
                )

            try:
                response = await client.get(url, headers=self.headers, timeout=10.0)

                if response.status_code == 200:
                    result = response.json()
                    duration_ms = int(elapsed * 1000)

                    logger.info("Windmill job completed", job_id=job_id, duration_ms=duration_ms)

                    return WindmillJobResult(
                        job_id=job_id,
                        status="completed",
                        result=result,
                        duration_ms=duration_ms
                    )
                elif response.status_code == 404:
                    # Job still running
                    await asyncio.sleep(1)
                else:
                    return WindmillJobResult(
                        job_id=job_id,
                        status="failed",
                        error=f"Unexpected status: {response.status_code}"
                    )
            except httpx.HTTPError as e:
                logger.warning("Error polling job", job_id=job_id, error=str(e))
                await asyncio.sleep(1)

    async def create_user_folder(self, user_id: str) -> bool:
        """Create a user-specific folder in Windmill."""
        url = f"{self.base_url}/api/w/{self.workspace}/folders/create"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    url,
                    headers=self.headers,
                    json={"name": f"u/{user_id}"},
                    timeout=10.0
                )
                return response.status_code in [200, 201, 409]  # 409 = already exists
            except httpx.HTTPError as e:
                logger.error("Failed to create user folder", user_id=user_id, error=str(e))
                return False

    async def create_script(
        self,
        path: str,
        content: str,
        language: str = "typescript",
        summary: str = ""
    ) -> bool:
        """Create a new script in Windmill."""
        url = f"{self.base_url}/api/w/{self.workspace}/scripts/create"

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    url,
                    headers=self.headers,
                    json={
                        "path": path,
                        "content": content,
                        "language": language,
                        "summary": summary
                    },
                    timeout=10.0
                )
                return response.status_code in [200, 201]
            except httpx.HTTPError as e:
                logger.error("Failed to create script", path=path, error=str(e))
                return False

    async def health_check(self) -> bool:
        """Check if Windmill is accessible."""
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    f"{self.base_url}/api/version",
                    timeout=5.0
                )
                return response.status_code == 200
            except httpx.HTTPError:
                return False


# Singleton instance
windmill_client = WindmillClient()
