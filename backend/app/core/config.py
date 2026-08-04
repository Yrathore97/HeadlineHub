from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Union
import json

class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    PORT: int = 8000
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:4321,http://127.0.0.1:4321"
    FRONTEND_URL: str = "http://localhost:4321"
    
    # Database
    DATABASE_URL: str = "postgresql://headlineuser:headlinepassword@localhost:5432/headlinedb"
    
    # JWT Auth Secrets
    JWT_SECRET: str = "super-secret-uncoshub-ai-key-change-this-in-production-2026"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # Google OAuth (OpenID Connect PKCE)
    GOOGLE_CLIENT_ID: str = "mock-google-client-id.apps.googleusercontent.com"
    GOOGLE_CLIENT_SECRET: str = "mock-google-client-secret"
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/auth/google/callback"
    
    # Translation Provider & External API
    TRANSLATION_API_KEY: str = "mock-key"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    def parsed_cors_origins(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        if isinstance(self.CORS_ORIGINS, str):
            if self.CORS_ORIGINS.startswith("["):
                try:
                    return json.loads(self.CORS_ORIGINS)
                except Exception:
                    pass
            return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
        return ["http://localhost:4321"]

settings = Settings()
