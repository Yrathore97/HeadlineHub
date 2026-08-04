from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from app.services.ai_engine import AIEngine
from app.core.database import mock_db

class TranslationProvider(ABC):
    @abstractmethod
    async def translate_text(self, text: str, target_lang: str) -> str:
        pass

class AIEngineTranslationProvider(TranslationProvider):
    def __init__(self):
        self.engine = AIEngine()

    async def translate_text(self, text: str, target_lang: str) -> str:
        return self.engine.translate(text, target_lang)

class TranslatorService:
    def __init__(self, provider: Optional[TranslationProvider] = None):
        self.provider = provider or AIEngineTranslationProvider()

    async def get_translated_article(self, article: Dict[str, Any], target_lang: str) -> Dict[str, Any]:
        """
        Returns cached translation if available; otherwise generates and caches translation.
        """
        native_lang = article.get("language", "en")
        if target_lang.lower() == native_lang.lower() or target_lang.lower() == "en":
            return {
                "headline": article["headline"],
                "summary": article["summary"]
            }

        cache_key = f"{article['id']}_{target_lang.lower()}"
        if cache_key in mock_db.translations:
            cached = mock_db.translations[cache_key]
            return {
                "headline": cached["headline"],
                "summary": cached["summary"]
            }

        # Perform translation
        translated_headline = await self.provider.translate_text(article["headline"], target_lang)
        translated_summary = await self.provider.translate_text(article["summary"], target_lang)

        # Store in cache
        mock_db.translations[cache_key] = {
            "id": f"trans-{cache_key}",
            "article_id": article["id"],
            "language": target_lang.lower(),
            "headline": translated_headline,
            "summary": translated_summary,
            "created_at": datetime.now(timezone.utc)
        }

        return {
            "headline": translated_headline,
            "summary": translated_summary
        }
