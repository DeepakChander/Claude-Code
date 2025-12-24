from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Server
    port: int = 8001
    host: str = "0.0.0.0"
    debug: bool = False

    # JWT
    jwt_secret: str = "default-secret-change-me"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Windmill
    windmill_url: str = "http://localhost:8000"
    windmill_token: str = ""
    windmill_workspace: str = "openanalyst"

    # Brain Service
    brain_service_url: str = "http://localhost:3456"

    # AI
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
