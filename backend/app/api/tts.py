import base64
import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Response
from pydantic import BaseModel, Field
from app.services.voice import get_voice_provider
from app.core.database import mock_db

router = APIRouter()

class TTSRequest(BaseModel):
    article_id: Optional[str] = None
    text: Optional[str] = Field(None, max_length=1000)
    language: str = "en"

@router.post("/tts")
async def generate_speech(payload: TTSRequest):
    """
    Streams or returns cached audio TTS for an article headline or summary.
    Uses Sarvam AI Bulbul V3 for Indic languages.
    """
    language = (payload.language or "en").lower()
    text_to_speech = payload.text
    article_id = payload.article_id or "custom"

    # If article_id is provided, retrieve headline + summary text if text is absent
    if payload.article_id and not text_to_speech:
        article = mock_db.articles.get(payload.article_id)
        if article:
            text_to_speech = f"{article['headline']}. {article['summary']}"
        else:
            text_to_speech = "UncosHub AI Verified News Update."

    if not text_to_speech or not text_to_speech.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text or valid article_id must be provided for audio synthesis."
        )

    cache_key = f"{article_id}_{language}"

    # 1. Check Voice Cache
    if cache_key in mock_db.voice_cache:
        cached_entry = mock_db.voice_cache[cache_key]
        return {
            "status": "success",
            "cached": True,
            "article_id": article_id,
            "language": language,
            "provider": "Sarvam AI Bulbul V3",
            "audio_url": cached_entry["audio_url"]
        }

    # 2. Synthesize audio via VoiceProvider (Sarvam AI / Fallback)
    try:
        provider = get_voice_provider(language)
        audio_bytes = await provider.synthesize(text_to_speech, language)

        # Convert to base64 Data URI for instant browser playback
        audio_b64 = base64.b64encode(audio_bytes).decode('utf-8')
        audio_url = f"data:audio/wav;base64,{audio_b64}"

        # 3. Save to Voice Cache
        mock_db.voice_cache[cache_key] = {
            "id": f"vc-{cache_key}",
            "article_id": article_id,
            "language": language,
            "audio_url": audio_url,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

        return {
            "status": "success",
            "cached": False,
            "article_id": article_id,
            "language": language,
            "provider": "Sarvam AI Bulbul V3",
            "audio_url": audio_url
        }

    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Audio voice generation temporarily unavailable: {str(err)}"
        )
