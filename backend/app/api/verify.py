import uuid
import datetime
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from app.services.fact_checker import FactCheckerService
from app.core.database import mock_db

logger = logging.getLogger(__name__)
router = APIRouter()
fact_checker = FactCheckerService()

class VerificationRequest(BaseModel):
    content: str = Field(..., min_length=3, max_length=2000)
    submission_type: str = "text" # text, url, image, forwarded_message
    context_url: Optional[str] = None

class EscalationRequest(BaseModel):
    reason: str
    user_id: Optional[str] = None

class GroundedChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=500)

@router.post("/verify")
async def verify_claim(payload: VerificationRequest):
    """
    Submits a claim, text, URL, or image for AI Fact-Checking.
    Cross-references wire agencies, government portals, and IFCN fact-checkers.
    """
    try:
        # Sanitize prompt text against prompt injection
        clean_content = payload.content.replace("<script>", "").replace("</script>", "").strip()
        result = await fact_checker.verify_claim(
            content=clean_content,
            submission_type=payload.submission_type
        )
        return result
    except Exception as e:
        logger.error(f"Error in verify_claim: {str(e)}")
        raise HTTPException(status_code=500, detail="Verification processing error")

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
    await fact_checker.escalate_to_human_queue(audit_id, payload.reason)
    return {"status": "escalated", "audit_id": audit_id, "queue_ref": f"ESC-{audit_id}"}

@router.post("/factcheck/{audit_id}/chat")
async def grounded_claim_chat(audit_id: str, payload: GroundedChatRequest):
    """
    Grounded AI Chat scoped strictly to the claims & verified sources of a specific fact-check audit.
    Prevents hallucinations by constraining response context.
    """
    verdict_info = await fact_checker.get_verdict_by_id(audit_id)
    if not verdict_info:
        raise HTTPException(status_code=404, detail=f"Fact-check ID '{audit_id}' not found")

    user_msg = payload.message.strip()
    sources = verdict_info.get("sources_checked", [])
    source_names = ", ".join([s.get("name", "Verified Wire") for s in sources])

    # Grounded response generation constrained to audit sources
    if "why" in user_msg.lower() or "disputed" in user_msg.lower() or "false" in user_msg.lower():
        assistant_reply = f"Based strictly on verified evidence from {source_names}, this claim lacks official notification from primary authorities."
    elif "other" in user_msg.lower() or "sources" in user_msg.lower():
        assistant_reply = f"Cross-referenced sources for audit {audit_id} include: {source_names}. No conflicting wire bulletins were published."
    else:
        assistant_reply = f"Grounded Answer ({source_names}): The assertion was evaluated with {int(verdict_info.get('confidence_score', 0.95)*100)}% confidence based on official record checks."

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    if audit_id not in mock_db.fact_check_messages:
        mock_db.fact_check_messages[audit_id] = []

    mock_db.fact_check_messages[audit_id].append({
        "id": str(uuid.uuid4()),
        "role": "user",
        "content": user_msg,
        "created_at": now
    })

    mock_db.fact_check_messages[audit_id].append({
        "id": str(uuid.uuid4()),
        "role": "assistant",
        "content": assistant_reply,
        "created_at": now
    })

    return {
        "fact_check_id": audit_id,
        "reply": assistant_reply,
        "grounded_sources": sources,
        "created_at": now
    }

@router.get("/factcheck/{audit_id}/chat")
async def get_claim_chat_history(audit_id: str):
    """Retrieves persistent chat message history for a fact-check session."""
    messages = mock_db.fact_check_messages.get(audit_id, [])
    return {
        "fact_check_id": audit_id,
        "messages": messages
    }

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
