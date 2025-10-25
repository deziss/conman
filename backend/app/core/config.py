from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "Conman"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "your-secret-key-here"  # Change this in production
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    CORS_ORIGINS: List[str] = ["http://localhost:5173"]  # Frontend URL

    # Database settings
    DATABASE_URL: str = "sqlite:///./app.db"
    
    # Redis settings
    REDIS_URL: str = "redis://localhost:6379/0"
    # Jaeger/OpenTelemetry
    JAEGER_HOST: str = "jaeger"
    JAEGER_PORT: int = 6831

    class Config:
        case_sensitive = True

settings = Settings()