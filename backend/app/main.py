import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import mock_db
from app.api import verify, auth, users, articles, tts

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

app = FastAPI(
    title="UncosHub AI Core API",
    description="Autonomous Media Ecosystem API for News Collection, Sarvam AI Voice TTS, Fact-Checking & Grounded AI Chat.",
    version="2.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

cors_origins = settings.parsed_cors_origins()
# CORS Security Hardening: Never allow wildcard '*' with credentials
if "*" in cors_origins:
    logger.warning("Wildcard CORS detected with credentials. Restricting to safe origins.")
    cors_origins = ["http://localhost:4321", "http://127.0.0.1:4321", "https://uncoshub.ai"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Router Registrations
app.include_router(auth.router, prefix="/api/v1", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1", tags=["User Preferences"])
app.include_router(articles.router, prefix="/api/v1", tags=["Articles & News Feed"])
app.include_router(verify.router, prefix="/api/v1", tags=["Fact Check & Grounded Chat"])
app.include_router(tts.router, prefix="/api/v1", tags=["Sarvam AI Voice TTS"])

@app.get("/health")
def health_check():
    # Verify DB connectivity / store health
    db_healthy = hasattr(mock_db, 'articles') and len(mock_db.articles) > 0
    return {
        "status": "healthy" if db_healthy else "degraded",
        "service": "UncosHub AI Backend",
        "version": "2.0.0",
        "database": "connected" if db_healthy else "error",
        "voice_engine": "Sarvam AI Bulbul V3 Ready"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
