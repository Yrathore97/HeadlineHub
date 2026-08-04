import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_user_preferences_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Signup user
        signup_res = await ac.post("/api/v1/auth/signup", json={
            "name": "Pref User",
            "email": "prefuser@example.com",
            "password": "Password123!"
        })
        token = signup_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get initial preferences
        get_res = await ac.get("/api/v1/users/me/preferences", headers=headers)
        assert get_res.status_code == 200
        assert get_res.json()["language"] == "en"

        # Update preferences
        patch_res = await ac.patch("/api/v1/users/me/preferences", headers=headers, json={
            "language": "kn",
            "region": {"state": "Karnataka", "district": "Bengaluru Urban"},
            "categories": ["Startups & Tech"]
        })
        assert patch_res.status_code == 200
        assert patch_res.json()["preferences"]["language"] == "kn"
        assert patch_res.json()["preferences"]["region"]["state"] == "Karnataka"

        # Verify invalid language fails
        invalid_lang_res = await ac.patch("/api/v1/users/me/preferences", headers=headers, json={
            "language": "invalid_lang_code"
        })
        assert invalid_lang_res.status_code == 400
