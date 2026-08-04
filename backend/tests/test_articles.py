import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_articles_and_personalized_feed():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Public feed
        pub_res = await ac.get("/api/v1/articles")
        assert pub_res.status_code == 200
        assert "articles" in pub_res.json()
        assert len(pub_res.json()["articles"]) > 0

        # Signup user with Karnataka state preference
        signup_res = await ac.post("/api/v1/auth/signup", json={
            "name": "Feed User",
            "email": "feeduser@example.com",
            "password": "Password123!",
            "preferred_language": "hi",
            "preferred_state": "Karnataka"
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Personalized feed
        feed_res = await ac.get("/api/v1/articles/feed", headers=headers)
        assert feed_res.status_code == 200
        feed_data = feed_res.json()
        assert feed_data["personalized"] is True
        assert feed_data["applied_preferences"]["state"] == "Karnataka"
        assert len(feed_data["articles"]) > 0

        # Single article translation
        art_id = feed_data["articles"][0]["id"]
        art_res = await ac.get(f"/api/v1/articles/{art_id}?lang=hi")
        assert art_res.status_code == 200
        assert "[HI TRANSLATION]" in art_res.json()["headline"]
