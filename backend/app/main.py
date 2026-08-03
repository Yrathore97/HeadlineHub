from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import verify

app = FastAPI(
    title="HeadlineHub AI Core API",
    description="Autonomous Media Ecosystem Microservice API for News Collection, AI Verification, Summarization, and Distribution.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(verify.router, prefix="/api/v1", tags=["Fact Check Verification"])

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "HeadlineHub AI Backend", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
