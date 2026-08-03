from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, HttpUrl
from typing import Optional, List
from app.services.fact_checker import FactCheckerService

router = APIRouter()
fact_checker = FactCheckerService()

class VerificationRequest(BaseModel):
    content: str
    submission_type: str = "text" # text, url, image, forwarded_message
    context_url: Optional[str] = None

class EscalationRequest(BaseModel):
    reason: str
    user_id: Optional[str] = None

@router.post("/verify")
async def verify_claim(payload: VerificationRequest):
    """
    Submits a claim, text, URL, or image for AI Fact-Checking.
    Cross-references wire agencies, government portals, and IFCN fact-checkers.
    """
    try:
        result = await fact_checker.verify_claim(
            content=payload.content,
            submission_type=payload.submission_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/verify/{audit_id}")
async def get_verdict(audit_id: str):
    """Retrieve audit verdict and evidence sources by audit ID."""
    result = await fact_checker.get_verdict_by_id(audit_id)
    if not result:
        raise HTTPException(status_code=404, detail="Audit ID not found")
    return result

@router.post("/verify/{audit_id}/escalate")
async def escalate_claim(audit_id: str, payload: EscalationRequest):
    """Route a disputed or high-stakes claim to the Human Moderator Review Queue."""
    success = await fact_checker.escalate_to_human_queue(audit_id, payload.reason)
    return {"status": "escalated", "audit_id": audit_id, "queue_ref": f"ESC-{audit_id}"}

@router.get("/verify/methodology")
async def get_methodology():
    """Public scoring methodology for auditing transparency."""
    return {
        "scoring_tiers": {
            "tier_1_official": ["PTI", "ANI", "PIB", "RBI", "ECI"],
            "tier_2_ifcn": ["Alt News", "BOOM Live", "Factly", "Vishvas News"],
            "tier_3_reputable_media": ["Reuters", "AP", "The Hindu", "Indian Express"]
        },
        "rules": [
            "No verdict issued without direct cited evidence source links.",
            "If evidence confidence < 60%, return Unverifiable.",
            "Election & Health claims automatically trigger human review queue."
        ]
    }
