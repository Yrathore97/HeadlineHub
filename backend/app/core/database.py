import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

try:
    import asyncpg
except ImportError:
    asyncpg = None

class MockDatabaseStore:
    def __init__(self):
        self.users: Dict[str, Dict[str, Any]] = {}
        self.refresh_tokens: Dict[str, Dict[str, Any]] = {}
        self.articles: Dict[str, Dict[str, Any]] = {}
        self.translations: Dict[str, Dict[str, Any]] = {}
        self.voice_cache: Dict[str, Dict[str, Any]] = {}
        self.fact_check_messages: Dict[str, List[Dict[str, Any]]] = {}
        self.seed_initial_articles()

    def seed_initial_articles(self):
        sample_articles = [
            {
                "id": "art-001",
                "headline": "RBI Keeps Repo Rate Steady at 6.5%, Projects 7.2% GDP Growth",
                "summary": "The RBI Monetary Policy Committee unanimously maintained the benchmark repo rate at 6.5%, citing strong macroeconomic fundamentals and stable inflation forecasts.",
                "content": "Full story on RBI policy...",
                "category": "Business & Economy",
                "region": "India",
                "state": "Maharashtra",
                "district": "Mumbai",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=600&q=80",
                "source": "RBI Gazette / PTI",
                "published_at": datetime.now(timezone.utc)
            },
            {
                "id": "art-002",
                "headline": "ISRO Assembles INSAT-3DS Satellite for Sriharikota Launch",
                "summary": "Indian Space Research Organisation has completed final payload integration for INSAT-3DS, expanding weather forecasting and disaster tracking capabilities.",
                "content": "Full story on ISRO mission...",
                "category": "Startups & Tech",
                "region": "India",
                "state": "Andhra Pradesh",
                "district": "Tirupati",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1517976487492-5750f3195933?auto=format&fit=crop&w=600&q=80",
                "source": "ISRO Official",
                "published_at": datetime.now(timezone.utc)
            },
            {
                "id": "art-003",
                "headline": "Karnataka Cabinet Approves ₹1,500 Cr AI Tech Hub in Bengaluru",
                "summary": "Karnataka announces a flagship GPU compute credit program and specialized AI innovation parks across Bengaluru to incubate deep-tech startups.",
                "content": "Full story on Karnataka AI Hub...",
                "category": "Hyperlocal",
                "region": "State",
                "state": "Karnataka",
                "district": "Bengaluru Urban",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=600&q=80",
                "source": "Karnataka Govt",
                "published_at": datetime.now(timezone.utc)
            },
            {
                "id": "art-004",
                "headline": "India Leads T20 Series Against Australia After Dominant Victory",
                "summary": "A stellar top-order batting display led India to a comfortable win with 4 overs remaining in the second T20 match at M. Chinnaswamy Stadium.",
                "content": "Full story on T20 match...",
                "category": "Sports",
                "region": "India",
                "state": "Karnataka",
                "district": "Bengaluru",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=600&q=80",
                "source": "BCCI / ANI",
                "published_at": datetime.now(timezone.utc)
            },
            {
                "id": "art-005",
                "headline": "Semiconductor Summit 2026 Inaugrated in New Delhi",
                "summary": "Global technology executives gather in New Delhi to finalize multi-billion dollar fabrication facility investments under India Semiconductor Mission.",
                "content": "Full story on Semiconductor Summit...",
                "category": "National",
                "region": "India",
                "state": "Delhi",
                "district": "New Delhi",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
                "source": "MeitY Press Release",
                "published_at": datetime.now(timezone.utc)
            },
            {
                "id": "art-006",
                "headline": "Tamil Nadu Renewable Grid Crosses 20GW Clean Energy Benchmark",
                "summary": "With new wind-solar hybrid projects operational, Tamil Nadu now fulfills over 45% of peak industrial power demand from clean energy.",
                "content": "Full story on TN Clean Energy...",
                "category": "Hyperlocal",
                "region": "State",
                "state": "Tamil Nadu",
                "district": "Coimbatore",
                "language": "en",
                "image_url": "https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=600&q=80",
                "source": "TANGEDCO",
                "published_at": datetime.now(timezone.utc)
            }
        ]
        for a in sample_articles:
            self.articles[a["id"]] = a

mock_db = MockDatabaseStore()
