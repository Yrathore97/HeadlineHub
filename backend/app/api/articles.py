from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from pydantic import BaseModel
from app.core.deps import get_current_user
from app.core.database import mock_db
from app.services.translator import TranslatorService

router = APIRouter()
translator = TranslatorService()

class ArticleOut(BaseModel):
    id: str
    headline: str
    summary: str
    content: Optional[str] = None
    category: str
    region: str
    state: Optional[str] = None
    district: Optional[str] = None
    language: str
    image_url: Optional[str] = None
    source: str
    published_at: str

@router.get("/articles")
async def get_public_articles(
    category: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50)
):
    articles = list(mock_db.articles.values())

    if category and category != "All News":
        articles = [a for a in articles if a["category"].lower() == category.lower()]
    if state and state != "All Regions":
        articles = [a for a in articles if (a.get("state") or "").lower() == state.lower()]
    if district:
        articles = [a for a in articles if (a.get("district") or "").lower() == district.lower()]
    if language:
        articles = [a for a in articles if (a.get("language") or "").lower() == language.lower()]

    articles.sort(key=lambda x: str(x.get("published_at")), reverse=True)

    total = len(articles)
    start = (page - 1) * page_size
    end = start + page_size
    paged = articles[start:end]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "articles": paged
    }

@router.get("/articles/feed")
async def get_personalized_feed(
    category: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    language: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user)
):
    prefs = current_user.get("preferences", {})
    user_lang = language or prefs.get("language", "en")
    user_reg = prefs.get("region", {})
    user_state = state or user_reg.get("state", "")
    user_district = district or user_reg.get("district", "")
    user_cats = [c.lower() for c in (prefs.get("categories") or [])]

    articles = list(mock_db.articles.values())

    if category and category != "All News":
        articles = [a for a in articles if a["category"].lower() == category.lower()]

    # Personalized ranking score algorithm
    def compute_score(art: Dict[str, Any]) -> float:
        score = 0.0
        art_state = (art.get("state") or "").lower()
        art_district = (art.get("district") or "").lower()
        art_cat = (art.get("category") or "").lower()

        if user_district and art_district == user_district.lower():
            score += 100.0
        if user_state and user_state != "All Regions" and art_state == user_state.lower():
            score += 50.0
        if art_cat in user_cats:
            score += 30.0
        return score

    articles.sort(key=lambda a: (compute_score(a), str(a.get("published_at"))), reverse=True)

    # Apply translations transparently if user's language is set and differs
    result_articles = []
    start = (page - 1) * page_size
    end = start + page_size
    paged = articles[start:end]

    for art in paged:
        art_copy = art.copy()
        if user_lang and user_lang != "en" and user_lang != art.get("language", "en"):
            trans = await translator.get_translated_article(art, user_lang)
            art_copy["headline"] = trans["headline"]
            art_copy["summary"] = trans["summary"]
        result_articles.append(art_copy)

    return {
        "total": len(articles),
        "page": page,
        "page_size": page_size,
        "personalized": True,
        "applied_preferences": {
            "language": user_lang,
            "state": user_state,
            "district": user_district
        },
        "articles": result_articles
    }

@router.get("/articles/{article_id}")
async def get_article_by_id(article_id: str, lang: Optional[str] = Query(None)):
    article = mock_db.articles.get(article_id)
    if not article:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Article not found")

    art_copy = article.copy()
    if lang and lang != "en" and lang != article.get("language", "en"):
        trans = await translator.get_translated_article(article, lang)
        art_copy["headline"] = trans["headline"]
        art_copy["summary"] = trans["summary"]

    return art_copy
