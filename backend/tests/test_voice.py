import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.voice import SarvamAIVoiceProvider

client = TestClient(app)

def test_tts_cache_hit_and_miss():
    payload = {
        "article_id": "art-001",
        "text": "RBI Keeps Repo Rate Steady at 6.5%",
        "language": "hi"
    }

    # First request: Cache Miss
    res1 = client.post("/api/v1/tts", json=payload)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["status"] == "success"
    assert data1["cached"] is False
    assert "data:audio/wav;base64," in data1["audio_url"]

    # Second request: Cache Hit
    res2 = client.post("/api/v1/tts", json=payload)
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["status"] == "success"
    assert data2["cached"] is True
    assert data2["audio_url"] == data1["audio_url"]

@pytest.mark.asyncio
async def test_sarvam_voice_provider_synthesis():
    provider = SarvamAIVoiceProvider()
    audio_bytes = await provider.synthesize("test headline summary", "hi")
    assert isinstance(audio_bytes, bytes)
    assert len(audio_bytes) > 0
