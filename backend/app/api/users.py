from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from app.core.deps import get_current_user
from app.core.database import mock_db

router = APIRouter()

SUPPORTED_LANGUAGES = [
    "en", "hi", "bn", "mr", "te", "ta", "gu", "kn", "ml", "pa",
    "or", "as", "ur", "bho", "ks", "doi", "kok", "mai", "mni", "sat", "ne", "brx", "sa", "sd"
]

KNOWN_CATEGORIES = [
    "All News", "National", "Politics", "Business & Economy",
    "Startups & Tech", "Sports", "Entertainment", "International", "Hyperlocal"
]

class RegionSchema(BaseModel):
    state: Optional[str] = None
    district: Optional[str] = None

class PreferenceUpdate(BaseModel):
    language: Optional[str] = None
    region: Optional[RegionSchema] = None
    categories: Optional[List[str]] = None

@router.get("/users/me/preferences")
async def get_user_preferences(current_user: dict = Depends(get_current_user)):
    prefs = current_user.get("preferences", {})
    return {
        "language": prefs.get("language", "en"),
        "region": prefs.get("region", {"state": current_user.get("location", "India"), "district": ""}),
        "categories": prefs.get("categories", [])
    }

@router.patch("/users/me/preferences")
async def update_user_preferences(
    payload: PreferenceUpdate,
    current_user: dict = Depends(get_current_user)
):
    prefs = current_user.get("preferences", {})

    if payload.language is not None:
        lang = payload.language.lower().strip()
        if lang not in SUPPORTED_LANGUAGES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported language '{payload.language}'. Supported languages: {SUPPORTED_LANGUAGES}"
            )
        prefs["language"] = lang

    if payload.region is not None:
        existing_reg = prefs.get("region", {})
        if payload.region.state is not None:
            existing_reg["state"] = payload.region.state
            current_user["location"] = payload.region.state
        if payload.region.district is not None:
            existing_reg["district"] = payload.region.district
        prefs["region"] = existing_reg

    if payload.categories is not None:
        cleaned_cats = [c.strip() for c in payload.categories if c.strip()]
        for c in cleaned_cats:
            if c not in KNOWN_CATEGORIES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown category '{c}'. Known categories: {KNOWN_CATEGORIES}"
                )
        prefs["categories"] = cleaned_cats

    current_user["preferences"] = prefs
    mock_db.users[current_user["id"]] = current_user

    return {
        "status": "success",
        "preferences": prefs
    }
