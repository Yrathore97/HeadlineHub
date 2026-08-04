import pytest
from urllib.parse import parse_qs, urlparse
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_signup_and_login_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Signup
        signup_res = await ac.post("/api/v1/auth/signup", json={
            "name": "Test Reader",
            "email": "reader@example.com",
            "password": "SecurePassword123!",
            "preferred_language": "hi",
            "preferred_state": "Karnataka"
        })
        assert signup_res.status_code == 201
        data = signup_res.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == "reader@example.com"
        assert data["user"]["preferences"]["language"] == "hi"

        # Login
        login_res = await ac.post("/api/v1/auth/login", json={
            "email": "reader@example.com",
            "password": "SecurePassword123!"
        })
        assert login_res.status_code == 200
        login_data = login_res.json()
        access_token = login_data["access_token"]
        refresh_token = login_data["refresh_token"]

        # Get Me
        me_res = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"})
        assert me_res.status_code == 200
        assert me_res.json()["name"] == "Test Reader"

        # Token Refresh
        refresh_res = await ac.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert refresh_res.status_code == 200
        assert "access_token" in refresh_res.json()

        # Logout
        logout_res = await ac.post("/api/v1/auth/logout", json={"refresh_token": refresh_token})
        assert logout_res.status_code == 200

        # Refresh after logout should fail
        refresh_after_res = await ac.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert refresh_after_res.status_code == 401

@pytest.mark.asyncio
async def test_invalid_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        res = await ac.post("/api/v1/auth/login", json={
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        })
        assert res.status_code == 401

@pytest.mark.asyncio
async def test_google_oauth_login_redirect_and_callback():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Initiate Google OAuth PKCE Login
        login_res = await ac.get("/api/v1/auth/google/login", follow_redirects=False)
        assert login_res.status_code == 307
        target_url = login_res.headers["location"]
        assert "accounts.google.com" in target_url
        assert "code_challenge=" in target_url

        # Extract state param from redirect URL
        parsed = urlparse(target_url)
        params = parse_qs(parsed.query)
        state_param = params["state"][0]

        # Simulate callback
        callback_res = await ac.get(f"/api/v1/auth/google/callback?code=mock_code&state={state_param}", follow_redirects=False)
        assert callback_res.status_code == 307
        redirect_loc = callback_res.headers["location"]
        assert "auth_token=" in redirect_loc

@pytest.mark.asyncio
async def test_block_password_login_on_oauth_only_accounts():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # 1. Trigger Google callback to create OAuth user
        login_res = await ac.get("/api/v1/auth/google/login", follow_redirects=False)
        parsed_url = urlparse(login_res.headers["location"])
        state_param = parse_qs(parsed_url.query)["state"][0]
        await ac.get(f"/api/v1/auth/google/callback?code=mock_code&state={state_param}", follow_redirects=False)

        # 2. Attempt password login on OAuth user (reader.google@example.com)
        login_attempt = await ac.post("/api/v1/auth/login", json={
            "email": "reader.google@example.com",
            "password": "GuessedPassword123!"
        })
        assert login_attempt.status_code == 400
        assert "Google Sign-In" in login_attempt.json()["detail"]
